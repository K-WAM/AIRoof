import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { resolveCustomer, bumpCustomerJobStats } from "@/lib/customers/resolve";
import { nextJobIdInTransaction } from "@/lib/jobs/createJob";
import type { Job } from "@/types/jobs";

type RequestRecord = { jobId?: string; callerName?: string; callerPhone?: string; callerEmail?: string; address?: string; serviceRequested?: string; serviceType?: string; notes?: string; sourceCallId?: string; startTime?: number; endTime?: number };

/** Human-triggered, idempotent conversion of one reviewed request into one job. */
export async function POST(req: NextRequest) {
  let body: { businessId?: string; appointmentId?: string; leadId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { businessId, appointmentId, leadId } = body;
  if (!businessId || (!appointmentId && !leadId) || (appointmentId && leadId)) return NextResponse.json({ error: "businessId and exactly one request id required" }, { status: 400 });
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const requestId = appointmentId ?? leadId!;

  const collection = appointmentId ? "appointments" : "leads";
  const source = await db.collection(`businesses/${businessId}/${collection}`).doc(requestId).get();
  if (!source.exists) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  const data = source.data() as RequestRecord;
  const serviceType = data.serviceType ?? data.serviceRequested ?? "Service request";
  const address = data.address ?? "Address to be confirmed";
  const now = Date.now();
  const customer = data.callerName ? await resolveCustomer(db, businessId, { name: data.callerName, phone: data.callerPhone, email: data.callerEmail, address: data.address }) : null;
  const call = data.sourceCallId ? await db.collection(`businesses/${businessId}/calls`).doc(data.sourceCallId).get() : null;
  const jobBase: Omit<Job, "jobId"> = {
    businessId, title: `${serviceType} — ${address}`, status: "open", address: data.address,
    clientName: data.callerName, clientPhone: data.callerPhone, clientEmail: data.callerEmail,
    serviceType, notes: data.notes, ...(appointmentId ? { appointmentId } : { leadId }),
    ...(data.sourceCallId ? { sourceCallId: data.sourceCallId, callSummary: call?.data()?.summary } : {}),
    ...(customer ? { customerId: customer.customerId } : {}), createdAt: now, updatedAt: now,
    // The time the caller booked (T-149): shown on the Unscheduled tile and preselected when it's dropped on a crew.
    // NOT scheduledStart — the booking already counts against the phone AI's capacity, so copying it there would
    // count the one visit twice.
    ...(typeof data.startTime === "number" && typeof data.endTime === "number" && data.endTime > data.startTime
      ? { requestedStart: data.startTime, requestedEnd: data.endTime }
      : {}),
  };
  const jobs = db.collection(`businesses/${businessId}/jobs`);
  // One call can leave a lead (an escalation) AND a booking (2026-09-28, Carla). They are one visit, so they share one
  // job: a job already made from the other one is reused, and a new job is stamped on both so both cards open it.
  const siblings = data.sourceCallId
    ? (await Promise.all((["appointments", "leads"] as const).map((name) =>
      db.collection(`businesses/${businessId}/${name}`).where("sourceCallId", "==", data.sourceCallId).get())))
      .flatMap((snap) => snap.docs)
      .filter((doc) => doc.ref.path !== source.ref.path)
    : [];
  // Jobs made from the New Job form before 2026-10-03 carry appointmentId/leadId but were never stamped on the request
  // (no marker): find them so this tap opens that job instead of making a second one.
  const legacyJobId = (await jobs.where(appointmentId ? "appointmentId" : "leadId", "==", requestId).limit(1).get()).docs[0]?.id;
  const siblingJobId = siblings.map((doc) => doc.data().jobId).find((id): id is string => typeof id === "string" && !!id) ?? legacyJobId;
  const marker = db.collection(`businesses/${businessId}/requestJobs`).doc(`${appointmentId ? "appointment" : "lead"}_${requestId}`);
  // The request doc also gets the jobId so the Pipeline card can show "Open Job J-…" instead of "Create Job" — it
  // used to keep offering Create, and the idempotent answer (the existing job) looked like a random old job opening.
  const result = await db.runTransaction(async (tx) => {
    const existing = await tx.get(marker);
    if (existing.exists) {
      const jobId = existing.data()?.jobId as string;
      if (data.jobId !== jobId) tx.update(source.ref, { jobId });
      return { jobId, created: false };
    }
    if (siblingJobId) {
      tx.create(marker, { jobId: siblingJobId, createdAt: now });
      tx.update(source.ref, { jobId: siblingJobId });
      return { jobId: siblingJobId, created: false };
    }
    const jobId = await nextJobIdInTransaction(tx, db.collection("businesses").doc(businessId));
    const job: Job = { ...jobBase, jobId };
    tx.create(jobs.doc(jobId), job);
    tx.create(marker, { jobId, createdAt: now });
    tx.update(source.ref, { jobId });
    for (const sibling of siblings) tx.update(sibling.ref, { jobId });
    return { jobId, created: true };
  });
  if (customer && result.created) await bumpCustomerJobStats(db, businessId, customer.customerId, now);
  const stored = await jobs.doc(result.jobId).get();
  const job = { jobId: result.jobId, ...stored.data() } as Job;
  return NextResponse.json({ job, created: result.created }, { status: result.created ? 201 : 200 });
}
