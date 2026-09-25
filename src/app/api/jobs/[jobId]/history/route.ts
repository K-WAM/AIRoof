import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { buildJobHistory } from "@/lib/jobs/history";
import type { FieldUpdate, Job } from "@/types/jobs";
import type { JobQuote } from "@/types/quote";
import type { JobInvoice } from "@/types/invoice";

// GET /api/jobs/[jobId]/history?businessId=  ->  { events }
// The job's audit trail, derived on read from the job's own records (call, request, updates, photos, punches, quote,
// invoice). Office roles only — the field screens have no use for it. Photos are read as metadata and stripped of
// their image data before anything leaves the server.

type Context = { params: Promise<{ jobId: string }> };
const MAX_PUNCHES = 200;

export async function GET(req: NextRequest, { params }: Context): Promise<Response> {
  const { jobId } = await params;
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return jsonWithCache({ error: "businessId required" }, "noStore", { status: 400 });

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "viewer", "superadmin"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Database unavailable" }, "noStore", { status: 503 });

  const base = db.collection("businesses").doc(businessId);
  const jobSnap = await base.collection("jobs").doc(jobId).get();
  if (!jobSnap.exists) return jsonWithCache({ error: "Job not found" }, "noStore", { status: 404 });
  const job = { jobId: jobSnap.id, ...jobSnap.data() } as Job;

  const one = async <T>(collection: string, id?: string): Promise<T | null> => {
    if (!id) return null;
    const snap = await base.collection(collection).doc(id).get();
    return snap.exists ? ({ ...snap.data() } as T) : null;
  };

  const [call, appointment, quote, invoice, updatesSnap, photosSnap, punchesSnap] = await Promise.all([
    one<{ startedAt?: number; createdAt?: number; callerName?: string; summary?: string | null }>("calls", job.sourceCallId),
    one<{ createdAt?: number; callerName?: string; serviceType?: string }>("appointments", job.appointmentId),
    one<JobQuote>("quotes", job.quoteId),
    one<JobInvoice>("invoices", job.invoiceId),
    base.collection("jobs").doc(jobId).collection("updates").orderBy("createdAt", "asc").get(),
    base.collection("jobs").doc(jobId).collection("photos").get(),
    base.collection("punches").where("jobId", "==", jobId).limit(MAX_PUNCHES).get(),
  ]);

  const events = buildJobHistory({
    job,
    call: call && job.sourceCallId ? { callId: job.sourceCallId, ...call } : null,
    appointment: appointment && job.appointmentId ? { appointmentId: job.appointmentId, ...appointment } : null,
    updates: updatesSnap.docs.map((d) => ({ updateId: d.id, ...d.data() }) as FieldUpdate),
    photos: photosSnap.docs.map((d) => {
      const data = d.data() as { label?: string; uploadedBy?: string; createdAt?: number };
      return { photoId: d.id, label: data.label, uploadedBy: data.uploadedBy, createdAt: data.createdAt ?? 0 }; // no image data
    }),
    punches: punchesSnap.docs.map((d) => ({ punchId: d.id, ...(d.data() as { type: string; workerName?: string; at: number; jobId?: string }) })),
    quote,
    invoice,
  });
  return jsonWithCache({ events }, "noStore");
}
