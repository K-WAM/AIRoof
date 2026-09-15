import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole, verifyFieldAccess } from "@/lib/auth/verifyRole";
import type { Job } from "@/types/jobs";

// GET /api/jobs?businessId=xxx[&customerId=xxx] — list jobs (session or field key)
//
// customerId is additive/optional — every existing caller (dashboard, jobs
// list, field, CalendarBoard, CommandBar) keeps its current unfiltered
// behavior. It exists for the Library's "click a customer, see every job"
// drawer (Phase 2) without touching the default query shape.
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyFieldAccess(req, businessId);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const customerId = req.nextUrl.searchParams.get("customerId");
  let query = db.collection(`businesses/${businessId}/jobs`) as FirebaseFirestore.Query;
  if (customerId) query = query.where("customerId", "==", customerId);
  query = query.orderBy("createdAt", "desc").limit(100);

  const snap = await query.get();
  const jobs = snap.docs.map((d) => ({ jobId: d.id, ...d.data() })) as Job[];
  return NextResponse.json({ jobs });
}

// POST /api/jobs — create job
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { businessId, title, address, clientName, clientPhone, serviceType, appointmentId, notes, customerId } = body;

  if (!businessId || !title) {
    return NextResponse.json({ error: "businessId and title required" }, { status: 400 });
  }

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  // Atomically increment job counter to produce short human-friendly ID (J-1042, J-1043, …)
  const bizRef = db.collection("businesses").doc(businessId);
  let counter = 1000;
  await db.runTransaction(async (tx) => {
    const bizSnap = await tx.get(bizRef);
    const current: number = bizSnap.data()?.jobCounter ?? 999;
    counter = current + 1;
    tx.update(bizRef, { jobCounter: counter });
  });

  const jobId = `J-${counter}`;
  const now = Date.now();
  const job: Job = {
    jobId,
    businessId,
    title: title.trim(),
    status: "open",
    address: address ?? undefined,
    clientName: clientName ?? undefined,
    clientPhone: clientPhone ?? undefined,
    customerId: customerId ?? undefined,
    serviceType: serviceType ?? undefined,
    appointmentId: appointmentId ?? undefined,
    notes: notes ?? undefined,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection(`businesses/${businessId}/jobs`).doc(jobId).set(job);

  // An existing customer was picked in the job-create combobox (as opposed
  // to a novel name, which instead triggers the non-blocking
  // POST /api/company/customers/resolve after this returns) — bump its
  // rollups now rather than leaving them stale until some later job.
  if (customerId) {
    const { bumpCustomerJobStats } = await import("@/lib/customers/resolve");
    await bumpCustomerJobStats(db, businessId, customerId, now).catch(() => {
      // A stale/bad customerId shouldn't fail job creation — the job is
      // already written above.
    });
  }

  return NextResponse.json({ job }, { status: 201 });
}
