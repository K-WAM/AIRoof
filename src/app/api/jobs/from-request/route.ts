import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { resolveCustomer, bumpCustomerJobStats } from "@/lib/customers/resolve";
import { nextJobId } from "@/lib/jobs/createJob";
import type { Job } from "@/types/jobs";

type RequestRecord = { callerName?: string; callerPhone?: string; callerEmail?: string; address?: string; serviceRequested?: string; serviceType?: string; notes?: string; sourceCallId?: string };

/** Human-triggered, idempotent conversion of one reviewed request into one job. */
export async function POST(req: NextRequest) {
  const { businessId, appointmentId, leadId } = await req.json() as { businessId?: string; appointmentId?: string; leadId?: string };
  if (!businessId || (!appointmentId && !leadId) || (appointmentId && leadId)) return NextResponse.json({ error: "businessId and exactly one request id required" }, { status: 400 });
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const key = appointmentId ? "appointmentId" : "leadId";
  const requestId = appointmentId ?? leadId!;
  const existing = await db.collection(`businesses/${businessId}/jobs`).where(key, "==", requestId).limit(1).get();
  if (!existing.empty) return NextResponse.json({ job: { jobId: existing.docs[0].id, ...existing.docs[0].data() }, created: false });

  const collection = appointmentId ? "appointments" : "leads";
  const source = await db.collection(`businesses/${businessId}/${collection}`).doc(requestId).get();
  if (!source.exists) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  const data = source.data() as RequestRecord;
  const serviceType = data.serviceType ?? data.serviceRequested ?? "Service request";
  const address = data.address ?? "Address to be confirmed";
  const now = Date.now();
  const customer = data.callerName ? await resolveCustomer(db, businessId, { name: data.callerName, phone: data.callerPhone, email: data.callerEmail, address: data.address }) : null;
  const call = data.sourceCallId ? await db.collection(`businesses/${businessId}/calls`).doc(data.sourceCallId).get() : null;
  const jobId = await nextJobId(db, businessId);
  const job: Job = {
    jobId, businessId, title: `${serviceType} — ${address}`, status: "open", address: data.address,
    clientName: data.callerName, clientPhone: data.callerPhone, clientEmail: data.callerEmail,
    serviceType, notes: data.notes, ...(appointmentId ? { appointmentId } : { leadId }),
    ...(data.sourceCallId ? { sourceCallId: data.sourceCallId, callSummary: call?.data()?.summary } : {}),
    ...(customer ? { customerId: customer.customerId } : {}), createdAt: now, updatedAt: now,
  };
  await db.collection(`businesses/${businessId}/jobs`).doc(jobId).set(job);
  if (customer) await bumpCustomerJobStats(db, businessId, customer.customerId, now);
  return NextResponse.json({ job, created: true }, { status: 201 });
}
