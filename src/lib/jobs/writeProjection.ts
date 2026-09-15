// Recompute job.parsed from the full updates ledger (+ the punches ledger, Phase 12/Phase 5)
// and write it + the legacy display mirror. Single implementation for every caller —
// previously duplicated near-verbatim in updates/route.ts and field-audio/route.ts, which is
// exactly the kind of drift that let one of them silently miss a fix to the other.

import { buildProjection, parsedToFieldLog } from "@/lib/jobs/projection";
import { foldPunches, punchedLaborForJob } from "@/lib/timeclock/fold";
import type { FieldUpdate, ParsedUpdate } from "@/types/jobs";
import type { Punch } from "@/types/timeclock";

// A punch ledger only ever needs to cover a modest recent window for any one job's labor —
// this is a defensive ceiling against an ever-growing per-business collection, the same
// "cap now, real fix later" posture the rest of this codebase already takes (e.g. the
// calls-list default limit). Revisit with pagination if a business's punch volume ever
// approaches it.
const PUNCH_QUERY_LIMIT = 2000;

export async function loadLedger(db: FirebaseFirestore.Firestore, businessId: string, jobId: string): Promise<FieldUpdate[]> {
  const snap = await db.collection(`businesses/${businessId}/jobs/${jobId}/updates`).orderBy("createdAt", "asc").get();
  return snap.docs.map((d) => ({ updateId: d.id, ...d.data() })) as FieldUpdate[];
}

export async function loadBusinessTz(db: FirebaseFirestore.Firestore, businessId: string): Promise<string> {
  const snap = await db.collection("businesses").doc(businessId).get();
  const tz = snap.data()?.timezone;
  return typeof tz === "string" && tz.length > 0 ? tz : "America/New_York";
}

async function loadPunchedLaborForJob(db: FirebaseFirestore.Firestore, businessId: string, jobId: string, tz: string) {
  const snap = await db
    .collection(`businesses/${businessId}/punches`)
    .orderBy("at", "desc")
    .limit(PUNCH_QUERY_LIMIT)
    .get();
  const punches = snap.docs.map((d) => ({ punchId: d.id, ...d.data() })) as Punch[];
  const days = foldPunches(punches, Date.now(), tz);
  return punchedLaborForJob(days, jobId);
}

/**
 * Recompute and persist a job's authoritative projection from its updates ledger, shadowed by
 * any punched labor on this job (Phase 12/Phase 5 — see docs/PLATFORM-EXPANSION-PLAN.md and
 * buildProjection's own doc comment for the merge rule). `bumpStatus` (default true) advances a
 * fresh job's status to "in_progress" on its first real content, matching prior behavior.
 */
export async function writeJobProjection(
  db: FirebaseFirestore.Firestore,
  businessId: string,
  jobId: string,
  opts: { ledger?: FieldUpdate[]; bumpStatus?: boolean } = {},
): Promise<ParsedUpdate> {
  const [ledger, tz] = await Promise.all([
    opts.ledger ?? loadLedger(db, businessId, jobId),
    loadBusinessTz(db, businessId),
  ]);
  const punchedLabor = await loadPunchedLaborForJob(db, businessId, jobId, tz);

  const projection = buildProjection(ledger, punchedLabor, tz);
  const log = parsedToFieldLog(projection);
  const jobRef = db.collection(`businesses/${businessId}/jobs`).doc(jobId);
  const snap = await jobRef.get();
  const status = snap.data()?.status;
  const bumpStatus = opts.bumpStatus ?? true;
  await jobRef.update({
    parsed: projection,
    materials: log.materials,
    laborEntries: log.laborEntries,
    timelineEvents: log.timelineEvents,
    fieldNotes: log.fieldNotes,
    totalLaborHours: log.totalLaborHours,
    updatedAt: Date.now(),
    ...(bumpStatus && ["open", "inspection"].includes(status ?? "") ? { status: "in_progress" } : {}),
  });
  return projection;
}
