import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { Job } from "@/types/jobs";

// GET /api/jobs?businessId=xxx — list jobs
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const snap = await db
    .collection(`businesses/${businessId}/jobs`)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  const jobs = snap.docs.map((d) => ({ jobId: d.id, ...d.data() })) as Job[];
  return NextResponse.json({ jobs });
}

// POST /api/jobs — create job
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { businessId, title, address, clientName, clientPhone, serviceType, appointmentId, notes } = body;

  if (!businessId || !title) {
    return NextResponse.json({ error: "businessId and title required" }, { status: 400 });
  }

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
    serviceType: serviceType ?? undefined,
    appointmentId: appointmentId ?? undefined,
    notes: notes ?? undefined,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection(`businesses/${businessId}/jobs`).doc(jobId).set(job);
  return NextResponse.json({ job }, { status: 201 });
}
