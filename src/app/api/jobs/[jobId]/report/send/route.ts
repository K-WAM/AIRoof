import { documentLetterhead } from "@/lib/companies/documentLetterhead";
import { loadDocumentCompany } from "@/lib/companies/documentCompany";
import { isMultiCompany } from "@/lib/companies/companies";
import { claimDocumentCompany, finishDocumentCompany } from "@/lib/companies/documentSend";
import { parseDocumentRecipients, deliverDocument, deliveryWarning } from "@/lib/documents/recipients";
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { buildProjection } from "@/lib/jobs/projection";
import { isCommsConfigured, sendEmail } from "@/lib/comms/send";
import type { FieldUpdate } from "@/types/jobs";
import type { LibraryLogo } from "@/types/library";
import type { JobQuote } from "@/types/quote";
import { buildJobReportEmailHtml } from "@/lib/billing/jobReportEmailHtml";
import { listPhotoMetas } from "@/lib/photos/store";
import { loadDocumentPhotos } from "@/lib/documents/photoSelection";
import { documentEmailSubject } from "@/lib/documents/emailCopy";
import { loadLetter } from "@/lib/documents/letterStore";
import { isCompletion } from "@/lib/documents/completionLetter";

// POST /api/jobs/[jobId]/report/send  body: { businessId, to, reportNotes? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!isCommsConfigured()) return NextResponse.json({ error: "Email not configured" }, { status: 503 });

  const body = await req.json().catch(() => null);

  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const { businessId, to, reportNotes } = body as {
    businessId?: string; to?: string | string[]; reportNotes?: string;
  };
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const parsedRecipients = parseDocumentRecipients(to);
  if ("error" in parsedRecipients) return NextResponse.json({ error: parsedRecipients.error }, { status: 400 });
  const { recipients } = parsedRecipients;

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Firestore not available" }, { status: 503 });

  const [jobSnap, bizSnap, updatesSnap, logosSnap] = await Promise.all([
    db.collection(`businesses/${businessId}/jobs`).doc(jobId).get(),
    db.collection("businesses").doc(businessId).get(),
    db.collection(`businesses/${businessId}/jobs/${jobId}/updates`).orderBy("createdAt", "asc").get(),
    db.collection(`businesses/${businessId}/library`).doc("logos").get(),
  ]);
  if (!jobSnap.exists) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const job = jobSnap.data()!;
  const metas = await listPhotoMetas(db, businessId, jobId);
  const photoIds = job.reportOptions?.showPhotos === false ? [] : metas.filter((photo) => photo.includeInReport).map((photo) => photo.photoId);
  const selected = await loadDocumentPhotos(db, businessId, jobId, photoIds, metas);
  if ("error" in selected) return NextResponse.json({ error: selected.error }, { status: 400 });
  // "Include the quote" is opt-in per report; the quote is read HERE, never taken from the browser, and only if it was sent.
  const quoteSnap = job.reportOptions?.includeQuote === true && typeof job.quoteId === "string" && job.quoteId
    ? await db.collection(`businesses/${businessId}/quotes`).doc(job.quoteId).get()
    : null;
  const quote = quoteSnap?.exists ? (quoteSnap.data() as JobQuote) : null;
  const storedBusiness = bizSnap.exists ? bizSnap.data()! : {};
  let claim;
  try { claim = isMultiCompany(storedBusiness) ? await claimDocumentCompany(db, businessId, jobId, "report") : null; }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Document is being sent" }, { status: 409 }); }
  let finalized = false;
  try {
  const biz = documentLetterhead(storedBusiness, await loadDocumentCompany(db, businessId, storedBusiness, claim ? { companyId: claim.companyId } : job.reportDocument, job), (logosSnap.data()?.logos as LibraryLogo[] | undefined) ?? [], job.reportDocument?.logoId);
  const bizName: string = biz.businessName ?? "Field Report";
  const projection = job.parsed ?? buildProjection(updatesSnap.docs.map((d) => ({ updateId: d.id, ...d.data() })) as FieldUpdate[]);
  const html = buildJobReportEmailHtml({
    reportDocument: job.reportDocument,
    ...(isCompletion(job.reportDocument) ? { template: await loadLetter(db, businessId, job.reportDocument.layout) } : {}),
    business: biz,
    logos: [],
    jobId,
    title: job.title ?? jobId,
    billTo: { name: job.clientName ?? "", address: job.address, phone: job.clientPhone },
    parsed: projection,
    findings: job.findings,
    narrative: reportNotes ?? job.reportNotes,
    options: job.reportOptions,
    technicians: job.reportTechnicians,
    photos: selected.photos,
    quote,
  });

  await db.collection(`businesses/${businessId}/jobs`).doc(jobId).update({ documentRecipients: recipients, updatedAt: Date.now() });
  const sent = await deliverDocument(recipients, recipient => sendEmail({
    businessId,
    to: recipient, subject: documentEmailSubject("report", bizName, job.title ?? jobId), html,
    fromName: bizName, replyTo: biz.contactEmail || biz.notificationEmail,
  }));
  if (sent.delivered.length === 0) {
    return NextResponse.json({ error: "The email could not be delivered — check the address and try again." }, { status: 502 });
  }
  await finishDocumentCompany(db, claim, true);
  finalized = true;
  return NextResponse.json({ ok: true, ...sent, warning: deliveryWarning(sent), ...(claim ? { companyId: claim.companyId } : {}) });
  } finally { if (!finalized) await finishDocumentCompany(db, claim, false); }
}
