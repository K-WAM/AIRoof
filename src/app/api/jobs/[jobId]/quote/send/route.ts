import { parseDocumentRecipients, deliverDocument, deliveryWarning } from "@/lib/documents/recipients";
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { getVerticalTemplate } from "@/lib/verticals/templates";
import { isCommsConfigured, sendEmail } from "@/lib/comms/send";
import { buildQuoteEmailHtml } from "@/lib/billing/jobQuoteEmailHtml";
import { documentLetterhead } from "@/lib/companies/documentLetterhead";
import { loadDocumentCompany } from "@/lib/companies/documentCompany";
import { isMultiCompany } from "@/lib/companies/companies";
import { claimDocumentCompany, finishDocumentCompany } from "@/lib/companies/documentSend";
import { noticesForDocument } from "@/lib/documents/notices";
import type { JobQuote } from "@/types/quote";
import type { Job } from "@/types/jobs";
import type { LibraryLogo } from "@/types/library";
import { listPhotoMetas } from "@/lib/photos/store";
import { loadDocumentPhotos } from "@/lib/documents/photoSelection";
import { getAppUrl } from "@/lib/config/appUrl";
import { newQuoteResponseToken, quoteResponseTokenHash, quoteResponseUrl } from "@/lib/billing/quoteResponse";
import { documentEmailSubject } from "@/lib/documents/emailCopy";
import { loadLetter } from "@/lib/documents/letterStore";
import type { LetterRate } from "@/lib/documents/quoteLetter";

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  let body: { businessId?: string; to?: string | string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { businessId, to } = body;
  if (typeof businessId !== "string" || !businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const parsedRecipients = parseDocumentRecipients(to);
  if ("error" in parsedRecipients) return NextResponse.json({ error: parsedRecipients.error }, { status: 400 });
  const { recipients } = parsedRecipients;
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;
  if (!isCommsConfigured()) return NextResponse.json({ error: "Email not configured" }, { status: 503 });
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const bizRef = db.collection("businesses").doc(businessId);
  const bizSnap = await bizRef.get();
  if (!bizSnap.exists || getVerticalTemplate(bizSnap.data()?.industry ?? "").disabledModules.includes("jobs")) {
    return NextResponse.json({ error: "Jobs module unavailable" }, { status: 403 });
  }
  const jobRef = db.collection(`businesses/${businessId}/jobs`).doc(jobId);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const job = jobSnap.data() as Job;
  if (!job.quoteId) return NextResponse.json({ error: "No quote exists" }, { status: 404 });
  const quoteRef = db.collection(`businesses/${businessId}/quotes`).doc(job.quoteId);
  const quoteSnap = await quoteRef.get();
  if (!quoteSnap.exists) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  const quote = quoteSnap.data() as JobQuote;
  if (quote.status !== "draft") return NextResponse.json({ error: "Only a draft quote can be sent" }, { status: 409 });
  if (quote.validUntil <= Date.now()) return NextResponse.json({ error: "Quote has expired" }, { status: 409 });
  if (!quote.lines.length || !quote.billTo.name.trim()) return NextResponse.json({ error: "Quote needs bill-to and at least one line" }, { status: 400 });
  const storedBusiness = bizSnap.data()!;
  let claim;
  try { claim = isMultiCompany(storedBusiness) ? await claimDocumentCompany(db, businessId, jobId, "quote") : null; }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Document is being sent" }, { status: 409 }); }
  let finalized = false;
  try {
  const logosSnap = await db.collection(`businesses/${businessId}/library`).doc("logos").get();
  const biz = documentLetterhead(storedBusiness, await loadDocumentCompany(db, businessId, storedBusiness, claim ? { companyId: claim.companyId } : quote, job), (logosSnap.data()?.logos as LibraryLogo[] | undefined) ?? [], quote.logoId);
  const letterhead = biz;
  const businessName: string = typeof biz.businessName === "string" ? biz.businessName.trim() : "";
  if (!businessName) return NextResponse.json({ error: "Business name required before sending" }, { status: 400 });
  // Terms & notices print only once the owner has approved the wording; statutory ones only for a residential job over the threshold.
  const notices = noticesForDocument({ doc: "quote", total: quote.total, commercial: job.propertyType === "commercial", settings: biz.documentNotices, business: { businessName, licenseNumber: biz.licenseNumber } });
  const metas = await listPhotoMetas(db, businessId, jobId);
  const photoIds = quote.photoIds ?? metas.filter((photo) => photo.includeInReport).map((photo) => photo.photoId);
  const selected = await loadDocumentPhotos(db, businessId, jobId, photoIds, metas);
  if ("error" in selected) return NextResponse.json({ error: selected.error }, { status: 400 });
  const responseToken = newQuoteResponseToken();
  const responseUrl = (decision: "accepted" | "declined") => quoteResponseUrl(getAppUrl(), businessId, jobId, responseToken, decision);
  const letterContext = quote.layout === "proposal" || quote.layout === "tm_authorization" ? {
    template: await loadLetter(db, businessId, quote.layout),
    rates: ((await db.collection(`businesses/${businessId}/library`).doc("pricing").get()).data()?.laborRates ?? []) as LetterRate[],
  } : undefined;
  const html = buildQuoteEmailHtml(quote, {
    businessName, brandColor: biz.brandColor, logoUrl: letterhead.logoUrl,
    address: biz.address, contactPhone: biz.contactPhone, contactEmail: biz.contactEmail, websiteUrl: biz.websiteUrl, licenseNumber: biz.licenseNumber,
  }, notices, selected.photos, { accept: responseUrl("accepted"), decline: responseUrl("declined") }, letterContext);
  await jobRef.update({ documentRecipients: recipients, updatedAt: Date.now() });
  const sent = await deliverDocument(recipients, recipient => sendEmail({
    businessId,
    to: recipient, subject: documentEmailSubject("quote", businessName, job.title, quote.quoteId), html,
    fromName: businessName, replyTo: biz.contactEmail || biz.notificationEmail,
  }));
  if (sent.delivered.length === 0) {
    return NextResponse.json({ error: "The email could not be delivered. Nothing was marked as sent — check the address and try again." }, { status: 502 });
  }
  const now = Date.now();
  const batch = db.batch();
  const sentPatch = { status: "sent", sentAt: now, sentTo: sent.delivered.join(", "), responseTokenHash: quoteResponseTokenHash(responseToken), updatedAt: now };
  if (claim) await finishDocumentCompany(db, claim, true, sentPatch);
  else batch.update(quoteRef, sentPatch);
  finalized = true;
  if (["open", "inspection"].includes(job.status)) batch.update(jobRef, { status: "quoted", updatedAt: now });
  await batch.commit();
  return NextResponse.json({ ok: true, ...sent, warning: deliveryWarning(sent), ...(claim ? { companyId: claim.companyId } : {}) });
  } finally { if (!finalized) await finishDocumentCompany(db, claim, false); }
}
