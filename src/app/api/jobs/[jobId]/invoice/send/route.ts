import { parseDocumentRecipients, deliverDocument, deliveryWarning } from "@/lib/documents/recipients";
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyOwnBusinessRole } from "@/lib/auth/verifyRole";
import { isCommsConfigured, sendEmail } from "@/lib/comms/send";
import { buildJobInvoiceEmailHtml } from "@/lib/billing/jobInvoiceEmailHtml";
import { documentLetterhead } from "@/lib/companies/documentLetterhead";
import { loadDocumentCompany } from "@/lib/companies/documentCompany";
import { resolvedInvoiceCopy, refreshGeneratedText } from "@/lib/companies/documentCopy";
import { companiesOf, isMultiCompany } from "@/lib/companies/companies";
import { depositOpeningText, invoiceOpeningText } from "@/lib/companies/documentOpening";
import { loadLetter } from "@/lib/documents/letterStore";
import type { Customer } from "@/types/customer";
import type { JobQuote } from "@/types/quote";
import { noticesForDocument } from "@/lib/documents/notices";
import { claimInvoiceSend, finishInvoiceSend } from "@/lib/billing/jobInvoiceStore";
import type { LibraryLogo } from "@/types/library";
import { listPhotoMetas } from "@/lib/photos/store";
import { loadDocumentPhotos } from "@/lib/documents/photoSelection";
import { documentEmailSubject } from "@/lib/documents/emailCopy";
import { fmtDate } from "@/lib/format";
import { effectiveBillingPrefs } from "@/lib/billing/customerPayments";
import { payNowAvailability } from "@/lib/billing/payNow";
import { signPayToken, validPayLink, invoicePayUrl } from "@/lib/billing/payNowToken";
import { isStripeConfigured } from "@/lib/billing/stripePayments";
import { getAppUrl } from "@/lib/config/appUrl";

// POST /api/jobs/[jobId]/invoice/send  body: { businessId, to }
// Phase 12/Phase 4 rewrite: reads the SAVED invoice doc instead of trusting rows the client
// sends — a client can no longer email totals that were never actually persisted/reviewed.
// The HTML itself is built by jobInvoiceEmailHtml.ts (a pure, unit-tested module) so this route
// stays a thin auth-and-fetch shell.
export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  if (!isCommsConfigured()) return NextResponse.json({ error: "Email not configured" }, { status: 503 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Firestore not available" }, { status: 503 });

  let body: { businessId?: string; to?: string | string[]; invoiceId?: string; newLink?: boolean };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { to } = body;
  const parsedRecipients = parseDocumentRecipients(to);
  if ("error" in parsedRecipients) return NextResponse.json({ error: parsedRecipients.error }, { status: 400 });
  const { recipients } = parsedRecipients;

  const gate = await verifyOwnBusinessRole(request, ["owner", "staff"]);
  if ("error" in gate) return gate.error;
  const businessId = gate.user.businessId!;

  if (body.invoiceId !== undefined && (typeof body.invoiceId !== "string" || !/^INV-\d+$/.test(body.invoiceId))) return NextResponse.json({ error: "Invalid deposit invoice" }, { status: 400 });
  if (body.newLink !== undefined && typeof body.newLink !== "boolean") return NextResponse.json({ error: "Invalid new link option" }, { status: 400 });
  let claimed;
  try { claimed = await claimInvoiceSend(db, businessId, jobId, body.invoiceId, body.newLink === true); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Invoice cannot be sent" }, { status: 409 }); }
  const { invoice, job, token } = claimed;
  let finalized = false;
  try {
  if (!invoice.billTo.name.trim() || ![
    ...invoice.labor.map((line) => line.name),
    ...invoice.materials.map((line) => line.item),
    ...invoice.other.map((line) => line.description),
  ].some((description) => description.trim())) {
    return NextResponse.json({ error: "Invoice needs bill-to and at least one described line" }, { status: 400 });
  }

  const [bizDoc, logosDoc] = await Promise.all([
    db.collection("businesses").doc(businessId).get(),
    db.collection(`businesses/${businessId}/library`).doc("logos").get(),
  ]);
  const storedBusiness = bizDoc.exists ? bizDoc.data()! : {};
  const resolvedCompany = await loadDocumentCompany(db, businessId, storedBusiness, invoice, job);
  const biz = documentLetterhead(storedBusiness, resolvedCompany, (logosDoc.data()?.logos as LibraryLogo[] | undefined) ?? [], invoice.logoId);
  // A company has to say how a customer pays IT. Without either field there is nothing safe to print, so refuse
  // instead of falling back to another company's (or the business's) bank account.
  if (resolvedCompany && !biz.billingPrefs?.payInstructions?.trim() && !biz.billingPrefs?.payLink?.trim()) {
    return NextResponse.json({ error: `Add ${resolvedCompany.shortName}'s payment details first (Library → Branding).` }, { status: 409 });
  }
  // Prepare the claimed link for delivery; it becomes payable only after finalization marks it sent.
  const payToken = validPayLink(invoice) && payNowAvailability({ ...biz, stripeConfigured: isStripeConfigured() }, { ...invoice, status: invoice.status === "draft" ? "sent" : invoice.status }) ? signPayToken(businessId, invoice.invoiceId, invoice.payLinkNonce!) : null;
  const payNowUrl = payToken ? invoicePayUrl(getAppUrl(), businessId, invoice.invoiceId, payToken) : undefined;
  const bizName: string = typeof biz.businessName === "string" ? biz.businessName.trim() : "";
  if (!bizName) return NextResponse.json({ error: "Business name required before sending" }, { status: 400 });

  // The logo library's default (Phase 12, Phase 4 remainder) takes precedence over the older
  // single businessConfig.logoUrl, same precedence as the in-app invoice doc and job report.
  const letterhead = biz;

  const metas = await listPhotoMetas(db, businessId, jobId);
  const photoIds = invoice.photoIds ?? metas.filter((photo) => photo.includeInReport).map((photo) => photo.photoId);
  const selected = await loadDocumentPhotos(db, businessId, jobId, photoIds, metas);
  if ("error" in selected) return NextResponse.json({ error: selected.error }, { status: 400 });
  // A draft's generated copy follows the company resolved for THIS send (a job switch can move it); edited text is kept.
  let opening = invoice.opening;
  if (invoice.status === "draft" && isMultiCompany(storedBusiness) && invoice.opening) {
    const companies = companiesOf(storedBusiness);
    const names = companies.map(company => company.name);
    // Only pay for the extra reads when the stored opening actually names a different company.
    if (names.some(name => name !== bizName && invoice.opening!.includes(name))) {
      const customerSnap = job.customerId ? await db.collection(`businesses/${businessId}/customers`).doc(job.customerId).get() : null;
      const quoteSnap = job.quoteId ? await db.collection(`businesses/${businessId}/quotes`).doc(job.quoteId).get() : null;
      const template = await loadLetter(db, businessId, invoice.kind === "deposit" ? "deposit_opening" : "invoice_opening");
      const brands = new Map(companies.map(company => [company.name, documentLetterhead(storedBusiness, company)] as const));
      const acceptedQuote = quoteSnap?.data()?.status === "accepted" ? quoteSnap.data() as JobQuote : null;
      opening = refreshGeneratedText(invoice.opening, names, bizName, name => invoice.kind === "deposit"
        ? depositOpeningText(template, job, customerSnap?.data() as Customer | undefined, name, invoice, storedBusiness)
        : invoiceOpeningText(template, job, customerSnap?.data() as Customer | undefined, name, brands.get(name)?.licenseNumber, invoice, storedBusiness, acceptedQuote));
    }
  }
  const sendable = invoice.status === "draft" ? { ...invoice, opening, ...resolvedInvoiceCopy(invoice, storedBusiness, job, bizName) } : invoice;
  const html = buildJobInvoiceEmailHtml(sendable, {
    businessName: bizName,
    brandColor: biz.brandColor,
    logoUrl: letterhead.logoUrl,
    address: biz.address,
    // Bug fix: this previously read `biz.phone`, a field that has never existed on
    // BusinessConfig (the branding field is `contactPhone`) — the business phone silently never
    // appeared on a sent invoice regardless of what was configured in Settings.
    contactPhone: biz.contactPhone,
    contactEmail: biz.contactEmail,
    websiteUrl: biz.websiteUrl,
    licenseNumber: biz.licenseNumber,
    industry: biz.industry,
    timezone: biz.timezone,
  }, job.findings?.filter((finding) => finding.includeInReport).map((finding) => ({ category: finding.category, problem: finding.problem, solution: finding.solution, note: finding.note })) ?? [],
  // Terms & notices print only once the owner has approved the wording (documents/notices.ts).
  noticesForDocument({ doc: "invoice", total: invoice.total, commercial: job.propertyType === "commercial", settings: biz.documentNotices, business: { businessName: bizName, licenseNumber: biz.licenseNumber } }), selected.photos,
  effectiveBillingPrefs(biz), payNowUrl);

  await db.collection(`businesses/${businessId}/jobs`).doc(jobId).update({ documentRecipients: recipients, updatedAt: Date.now() });
  const sent = await deliverDocument(recipients, recipient => sendEmail({
    businessId,
    to: recipient,
    subject: documentEmailSubject("invoice", bizName, job.title, invoice.invoiceId, invoice.dueAt ? fmtDate(invoice.dueAt, biz.timezone ?? "America/New_York") : ""),
    html,
    fromName: bizName,
    replyTo: biz.contactEmail || biz.notificationEmail,
  }));
  // Never mark an invoice "sent" that the mail provider rejected — the office would believe the customer has it.
  if (sent.delivered.length === 0) {
    return NextResponse.json({ error: "The email could not be delivered. Nothing was marked as sent — check the address and try again." }, { status: 502 });
  }

  await finishInvoiceSend(db, businessId, jobId, invoice.invoiceId, token, sent.delivered.join(", "), gate.user.uid, true);
  finalized = true;
  // Authorized senders can recover the URL later through the guarded pay-link route.
  return NextResponse.json({ ok: true, ...sent, warning: deliveryWarning(sent), ...(invoice.companyId ? { companyId: invoice.companyId } : {}), payNow: payToken ? { url: payNowUrl, expiresAt: invoice.payLinkExpiresAt } : null }, { headers: { "Cache-Control": "private, no-store" } });
  } finally {
    if (!finalized) await finishInvoiceSend(db, businessId, jobId, invoice.invoiceId, token, recipients.join(", "), gate.user.uid, false);
  }
}
