import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { isCommsConfigured, sendEmail } from "@/lib/comms/send";
import { buildJobInvoiceEmailHtml } from "@/lib/billing/jobInvoiceEmailHtml";
import { resolveLetterhead } from "@/lib/documents/letterhead";
import { noticesForDocument } from "@/lib/documents/notices";
import type { JobInvoice } from "@/types/invoice";
import type { Job, JobStatusChange } from "@/types/jobs";
import type { LibraryLogo } from "@/types/library";

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

  let body: { businessId?: string; to?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { businessId, to } = body;
  if (!businessId || !to) return NextResponse.json({ error: "businessId and to required" }, { status: 400 });

  const gate = await verifyAuthAndRole(request, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const jobRef = db.collection(`businesses/${businessId}/jobs`).doc(jobId);
  const jobSnap = await jobRef.get();
  const invoiceId = jobSnap.data()?.invoiceId;
  if (!invoiceId) return NextResponse.json({ error: "No invoice exists for this job yet" }, { status: 404 });

  const invRef = db.collection(`businesses/${businessId}/invoices`).doc(invoiceId);
  const invSnap = await invRef.get();
  if (!invSnap.exists) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const invoice = invSnap.data() as JobInvoice;
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
  const letterhead = resolveLetterhead(biz, (logosDoc.data()?.logos as LibraryLogo[] | undefined) ?? []);

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
  }, (jobSnap.data() as Job).findings?.filter((finding) => finding.includeInReport).map((finding) => ({ problem: finding.problem, solution: finding.solution })) ?? [],
  // Terms & notices print only once the owner has approved the wording (documents/notices.ts).
  noticesForDocument({ doc: "invoice", total: invoice.total, commercial: (jobSnap.data() as Job).propertyType === "commercial", settings: biz.documentNotices, business: { businessName: bizName, licenseNumber: biz.licenseNumber } }));

  const sent = await sendEmail({
    to,
    subject: `[Invoice] ${invoice.invoiceId} from ${bizName}`,
    html,
    fromName: bizName,
    replyTo: biz.contactEmail || biz.notificationEmail,
  });
  // Never mark an invoice "sent" that the mail provider rejected — the office would believe the customer has it.
  if (sent.status !== "delivered") {
    return NextResponse.json({ error: "The email could not be delivered. Nothing was marked as sent — check the address and try again." }, { status: 502 });
  }

  const now = Date.now();
  // A resend of a paid invoice must not knock it back to "sent".
  await invRef.update({ ...(invoice.status === "paid" ? {} : { status: "sent" }), sentAt: now, sentTo: to, updatedAt: now });

  // Sending — not drafting — is what bills the customer, so this is the moment the job becomes Invoiced.
  const job = jobSnap.data() as Job;
  if (job.status !== "invoiced") {
    const change: JobStatusChange = { status: "invoiced", at: now, by: gate.user.uid };
    await jobRef.update({ status: "invoiced", updatedAt: now, statusHistory: [...(job.statusHistory ?? []), change] });
  }

  return NextResponse.json({ ok: true });
}
