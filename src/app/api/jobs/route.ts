import { NextRequest, NextResponse, after } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole, verifyFieldAccess } from "@/lib/auth/verifyRole";
import type { Job } from "@/types/jobs";
import { nextJobId, nextJobIdInTransaction } from "@/lib/jobs/createJob";

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
  const status = req.nextUrl.searchParams.get("status");
  const validStatuses = new Set(["open", "inspection", "quoted", "in_progress", "invoiced", "complete"]);
  if (status && !validStatuses.has(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  const beforeRaw = req.nextUrl.searchParams.get("before");
  const before = beforeRaw === null ? null : Number(beforeRaw);
  if (beforeRaw !== null && (!Number.isFinite(before) || before! <= 0)) {
    return NextResponse.json({ error: "Invalid before cursor" }, { status: 400 });
  }
  let query = db.collection(`businesses/${businessId}/jobs`) as FirebaseFirestore.Query;
  if (customerId) query = query.where("customerId", "==", customerId);
  if (status) {
    // Status-only reads use Firestore's automatic single-field index. Sorting
    // after the read avoids requiring a new composite index for every status.
    query = status === "inspection"
      ? query.where("status", "in", ["inspection", "open"])
      : query.where("status", "==", status);
  } else {
    if (before !== null) query = query.where("createdAt", "<", before);
    query = query.orderBy("createdAt", "desc").limit(101);
  }

  const snap = await query.get();
  let jobs = snap.docs.map((d) => ({ jobId: d.id, ...d.data() })) as Job[];
  if (status) jobs = jobs.filter((job) => before === null || job.createdAt < before).sort((a, b) => b.createdAt - a.createdAt);

  const crewId = req.nextUrl.searchParams.get("crewId");
  if (crewId) {
    const includeUnassigned = req.nextUrl.searchParams.get("includeUnassigned") === "1";
    jobs = jobs.filter((j) => j.assignedCrewId === crewId || (includeUnassigned && !j.assignedCrewId));
  }

  const hasMore = jobs.length > 100;
  jobs = jobs.slice(0, 100);
  return NextResponse.json({ jobs, hasMore, nextBefore: hasMore ? jobs.at(-1)?.createdAt : null });
}

// POST /api/jobs — create job
/** Trimmed string capped at `max` characters; anything else (missing, wrong type, blank) is undefined. */
function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed || undefined;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const businessId = cleanText(body.businessId, 128);
  const title = cleanText(body.title, 200);
  // A pasted novel can't bloat the job doc toward Firestore's 1 MB limit (the doc also carries the updates ledger).
  const address = cleanText(body.address, 300);
  const clientName = cleanText(body.clientName, 200);
  const clientPhone = cleanText(body.clientPhone, 40);
  const clientEmail = cleanText(body.clientEmail, 254);
  const serviceType = cleanText(body.serviceType, 120);
  const notes = cleanText(body.notes, 4000);
  const customerId = cleanText(body.customerId, 128);
  const appointmentId = cleanText(body.appointmentId, 128);

  if (!businessId || !title) {
    return NextResponse.json({ error: "businessId and title required" }, { status: 400 });
  }
  if ((customerId && customerId.includes("/")) || (appointmentId && appointmentId.includes("/"))) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const now = Date.now();
  const fields: Omit<Job, "jobId"> = {
    businessId,
    title,
    status: "open",
    address,
    clientName,
    clientPhone,
    clientEmail,
    customerId,
    serviceType,
    appointmentId,
    notes,
    createdAt: now,
    updatedAt: now,
  };
  const jobs = db.collection(`businesses/${businessId}/jobs`);

  let job: Job;
  if (appointmentId) {
    // "New Job" prefilled from a booking: one booking makes one job — the same rule (and the same marker doc) as
    // POST /api/jobs/from-request. Without it the booking card kept offering "Create Job" and a second job got made.
    const appointment = db.collection(`businesses/${businessId}/appointments`).doc(appointmentId);
    const marker = db.collection(`businesses/${businessId}/requestJobs`).doc(`appointment_${appointmentId}`);
    const result = await db.runTransaction(async (tx) => {
      const [existing, appt] = await Promise.all([tx.get(marker), tx.get(appointment)]);
      if (existing.exists) return { jobId: existing.data()?.jobId as string, created: false };
      const jobId = await nextJobIdInTransaction(tx, db.collection("businesses").doc(businessId));
      tx.create(jobs.doc(jobId), { ...fields, jobId });
      if (appt.exists) {
        tx.create(marker, { jobId, createdAt: now });
        tx.update(appointment, { jobId });
      }
      return { jobId, created: true };
    });
    if (!result.created) {
      const stored = await jobs.doc(result.jobId).get();
      return NextResponse.json({ job: { jobId: result.jobId, ...stored.data() }, created: false }, { status: 200 });
    }
    job = { ...fields, jobId: result.jobId };
  } else {
    // Atomically increment job counter to produce short human-friendly ID (J-1042, J-1043, …)
    const jobId = await nextJobId(db, businessId);
    job = { ...fields, jobId };
    await jobs.doc(jobId).set(job);
  }

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
  // A typed name with no customer picked: find-or-create the customer and link it on the SERVER, after the response
  // goes out (so the create stays as fast as before). This used to be a second browser call fired after the create —
  // a closed tab or a dropped request left the job with no customer, and it never showed in Customers.
  else if (clientName) {
    const jobRef = jobs.doc(job.jobId);
    afterResponse(async () => {
      const { resolveCustomer, bumpCustomerJobStats } = await import("@/lib/customers/resolve");
      const { customerId: linked } = await resolveCustomer(db, businessId, { name: clientName, phone: clientPhone, email: clientEmail, address });
      const linkedNow = await db.runTransaction(async (tx) => {
        const snap = await tx.get(jobRef);
        if (!snap.exists || snap.data()?.customerId) return false; // never overwrite a link made meanwhile
        tx.update(jobRef, { customerId: linked });
        return true;
      });
      if (linkedNow) await bumpCustomerJobStats(db, businessId, linked, now);
    });
  }

  return NextResponse.json({ job, created: true }, { status: 201 });
}

/** Work that must not delay the response. Outside a request (unit tests) it simply runs now. Never throws. */
function afterResponse(work: () => Promise<void>): void {
  const run = () => work().catch((error) => console.warn("job create: customer link skipped", error instanceof Error ? error.message : error));
  try { after(run); } catch { void run(); }
}
