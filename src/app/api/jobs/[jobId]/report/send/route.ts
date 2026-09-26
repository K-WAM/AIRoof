import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { buildProjection } from "@/lib/jobs/projection";
import { isCommsConfigured, sendEmail } from "@/lib/comms/send";
import type { FieldUpdate } from "@/types/jobs";
import type { LibraryLogo } from "@/types/library";
import type { JobQuote } from "@/types/quote";
import { buildJobReportEmailHtml } from "@/lib/billing/jobReportEmailHtml";

const MAX_EMAIL_REPORT_PHOTOS = 12;

// POST /api/jobs/[jobId]/report/send  body: { businessId, to, reportNotes?, photos?: [{label, fullB64}] }
export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!isCommsConfigured()) return NextResponse.json({ error: "Email not configured" }, { status: 503 });

  const body = await req.json();
  const { businessId, to, reportNotes, photos } = body as {
    businessId?: string; to?: string; reportNotes?: string;
    photos?: Array<{ label: string; fullB64: string }>;
  };
  if (!businessId || !to) return NextResponse.json({ error: "businessId and to required" }, { status: 400 });

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
  // "Include the quote" is opt-in per report; the quote is read HERE, never taken from the browser, and only if it was sent.
  const quoteSnap = job.reportOptions?.includeQuote === true && typeof job.quoteId === "string" && job.quoteId
    ? await db.collection(`businesses/${businessId}/quotes`).doc(job.quoteId).get()
    : null;
  const quote = quoteSnap?.exists ? (quoteSnap.data() as JobQuote) : null;
  const biz = bizSnap.exists ? bizSnap.data()! : {};
  const bizName: string = biz.businessName ?? "Field Report";
  const projection = job.parsed ?? buildProjection(updatesSnap.docs.map((d) => ({ updateId: d.id, ...d.data() })) as FieldUpdate[]);
  const html = buildJobReportEmailHtml({
    business: biz,
    logos: (logosSnap.data()?.logos as LibraryLogo[] | undefined) ?? [],
    jobId,
    title: job.title ?? jobId,
    billTo: { name: job.clientName ?? "", address: job.address, phone: job.clientPhone },
    parsed: projection,
    findings: job.findings,
    narrative: reportNotes ?? job.reportNotes,
    options: job.reportOptions,
    technicians: job.reportTechnicians,
    photos: Array.isArray(photos) ? photos.slice(0, MAX_EMAIL_REPORT_PHOTOS) : [],
    quote,
  });

  const sent = await sendEmail({
    to, subject: `[Report] ${job.title ?? jobId} from ${bizName}`, html,
    fromName: bizName, replyTo: biz.contactEmail || biz.notificationEmail,
  });
  if (sent.status !== "delivered") {
    return NextResponse.json({ error: "The email could not be delivered — check the address and try again." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
