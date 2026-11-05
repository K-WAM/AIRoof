import { parseDocumentRecipients, deliverDocument, deliveryWarning } from "@/lib/documents/recipients";
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { isCommsConfigured, sendEmail } from "@/lib/comms/send";
import { buildJobInvoiceEmailHtml } from "@/lib/billing/jobInvoiceEmailHtml";
import { resolveLetterhead } from "@/lib/documents/letterhead";
import { noticesForDocument } from "@/lib/documents/notices";
import { claimInvoiceSend, finishInvoiceSend } from "@/lib/billing/jobInvoiceStore";
import type { LibraryLogo } from "@/types/library";
import { listPhotoMetas } from "@/lib/photos/store";
import { loadDocumentPhotos } from "@/lib/documents/photoSelection";
import { documentEmailSubject } from "@/lib/documents/emailCopy";
import { fmtDate } from "@/lib/format";
import { effectiveBillingPrefs } from "@/lib/billing/customerPayments";

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

  let body: { businessId?: string; to?: string | string[]; invoiceId?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { businessId, to } = body;
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const parsedRecipients = parseDocumentRecipients(to);
  if ("error" in parsedRecipients) return NextResponse.json({ error: parsedRecipients.error }, { status: 400 });
  const { recipients } = parsedRecipients;

  const gate = await verifyAuthAndRole(request, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  if (body.invoiceId !== undefined && (typeof body.invoiceId !== "string" || !/^INV-\d+$/.test(body.invoiceId))) return NextResponse.json({ error: "Invalid deposit invoice" }, { status: 400 });
  let claimed;
  try { claimed = await claimInvoiceSend(db, businessId, jobId, body.invoiceId); }
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
  const biz = bizDoc.exists ? bizDoc.data()! : {};
  const bizName: string = typeof biz.businessName === "string" ? biz.businessName.trim() : "";
  if (!bizName) return NextResponse.json({ error: "Business name required before sending" }, { status: 400 });

  // The logo library's default (Phase 12, Phase 4 remainder) takes precedence over the older
  // single businessConfig.logoUrl, same precedence as the in-app invoice doc and job report.
  const letterhead = resolveLetterhead(biz, (logosDoc.data()?.logos as LibraryLogo[] | undefined) ?? [], "light", invoice.logoId);

  const metas = await listPhotoMetas(db, businessId, jobId);
  const photoIds = invoice.photoIds ?? metas.filter((photo) => photo.includeInReport).map((photo) => photo.photoId);
  const selected = await loadDocumentPhotos(db, businessId, jobId, photoIds, metas);
  if ("error" in selected) return NextResponse.json({ error: selected.error }, { status: 400 });
  const html = buildJobInvoiceEmailHtml(invoice, {
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
  effectiveBillingPrefs(biz));

  await db.collection(`businesses/${businessId}/jobs`).doc(jobId).update({ documentRecipients: recipients, updatedAt: Date.now() });
  const sent = await deliverDocument(recipients, recipient => sendEmail({
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
  return NextResponse.json({ ok: true, ...sent, warning: deliveryWarning(sent) });
  } finally {
    if (!finalized) await finishInvoiceSend(db, businessId, jobId, invoice.invoiceId, token, recipients.join(", "), gate.user.uid, false);
  }
}
