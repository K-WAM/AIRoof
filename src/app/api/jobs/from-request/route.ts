import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { resolveCustomer, bumpCustomerJobStats } from "@/lib/customers/resolve";
import { nextJobIdInTransaction } from "@/lib/jobs/createJob";
import type { Job } from "@/types/jobs";

type RequestRecord = { callerName?: string; callerPhone?: string; callerEmail?: string; address?: string; serviceRequested?: string; serviceType?: string; notes?: string; sourceCallId?: string };

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
  };
  const jobs = db.collection(`businesses/${businessId}/jobs`);
  const marker = db.collection(`businesses/${businessId}/requestJobs`).doc(`${appointmentId ? "appointment" : "lead"}_${requestId}`);
  const result = await db.runTransaction(async (tx) => {
    const existing = await tx.get(marker);
    if (existing.exists) return { jobId: existing.data()?.jobId as string, created: false };
    const jobId = await nextJobIdInTransaction(tx, db.collection("businesses").doc(businessId));
    const job: Job = { ...jobBase, jobId };
    tx.create(jobs.doc(jobId), job);
    tx.create(marker, { jobId, createdAt: now });
    return { jobId, created: true };
  });
  if (customer && result.created) await bumpCustomerJobStats(db, businessId, customer.customerId, now);
  const stored = await jobs.doc(result.jobId).get();
  const job = { jobId: result.jobId, ...stored.data() } as Job;
  return NextResponse.json({ job, created: result.created }, { status: result.created ? 201 : 200 });
}
