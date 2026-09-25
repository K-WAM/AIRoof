import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole, verifyFieldAccess } from "@/lib/auth/verifyRole";
import type { Job } from "@/types/jobs";
import { nextJobId } from "@/lib/jobs/createJob";

// GET /api/jobs?businessId=xxx[&customerId=xxx][&crewId=xxx&includeUnassigned=1] — list jobs
// (session or field key)
//
// customerId is additive/optional — every existing caller (dashboard, jobs
// list, field, CalendarBoard, CommandBar) keeps its current unfiltered
// behavior. It exists for the Library's "click a customer, see every job"
// drawer (Phase 2) without touching the default query shape.
//
// crewId/includeUnassigned (Phase 12/Phase 7) filter to one crew's jobs plus
// (optionally) unassigned ones — for a trade worker's /company/field, which
// would otherwise list the whole business's open jobs regardless of who's
// actually on them. Filtered in memory over the same bounded read rather than
// a second `where("assignedCrewId","==",…)` Firestore query, matching this
// codebase's own precedent (Customers search, Phase 2) for a small-scale
// filter that doesn't earn a new composite index.
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
  let jobs = snap.docs.map((d) => ({ jobId: d.id, ...d.data() })) as Job[];

  const crewId = req.nextUrl.searchParams.get("crewId");
  if (crewId) {
    const includeUnassigned = req.nextUrl.searchParams.get("includeUnassigned") === "1";
    jobs = jobs.filter((j) => j.assignedCrewId === crewId || (includeUnassigned && !j.assignedCrewId));
  }

  return NextResponse.json({ jobs });
}

// POST /api/jobs — create job
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { businessId, title, address, clientName, clientPhone, clientEmail, serviceType, appointmentId, notes, customerId } = body;

  if (!businessId || !title) {
    return NextResponse.json({ error: "businessId and title required" }, { status: 400 });
  }

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  // Atomically increment job counter to produce short human-friendly ID (J-1042, J-1043, …)
  const jobId = await nextJobId(db, businessId);
  const now = Date.now();
  const job: Job = {
    jobId,
    businessId,
    title: title.trim(),
    status: "open",
    address: address ?? undefined,
    clientName: clientName ?? undefined,
    clientPhone: clientPhone ?? undefined,
    clientEmail: clientEmail ?? undefined,
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
