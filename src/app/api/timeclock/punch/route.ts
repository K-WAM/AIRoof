// POST /api/timeclock/punch — the cross-job guard (docs/PLATFORM-EXPANSION-PLAN.md Phase 5).
// GET  /api/timeclock/punch — today's folded state for one worker, so the field screen can
//                             render the right buttons on load with no separate query.
//
// This route only carries the LIVE field-app punch flow. The mobile-editable admin time-edit
// sheet (append a `supersedes` pair, role-gated to owner/staff) is spec'd but not built in this
// pass — deliberately deferred, same as several other Phase-12 UI slices, rather than shipping a
// half-clicked-through edit surface. Nothing here blocks adding it later: it's just more Punch
// writes through the same ledger.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyFieldAccess } from "@/lib/auth/verifyRole";
import { loadBusinessTz, writeJobProjection } from "@/lib/jobs/writeProjection";
import { foldPunches } from "@/lib/timeclock/fold";
import { applyPunch, isSitePunch } from "@/lib/timeclock/machine";
import { dayKey, normalizeName } from "@/lib/format";
import type { Punch, PunchType, WorkerDay } from "@/types/timeclock";

const PUNCH_TYPES: ReadonlySet<PunchType> = new Set([
  "office_in", "site_in", "break_start", "break_end", "site_out", "office_out",
]);

/** Punched labor is part of each job's projection (the Labor tab and the invoice draft read it), so re-project every job
 *  a punch touched — before this, a punch only reached the Labor tab on the job's NEXT field update. Best effort: the
 *  punch itself is already saved, so a failed re-projection must not turn it into an error. */
async function reprojectJobs(db: FirebaseFirestore.Firestore, businessId: string, jobIds: Array<string | undefined>) {
  const ids = [...new Set(jobIds.filter((id): id is string => typeof id === "string" && id.length > 0))];
  await Promise.all(ids.map((id) => writeJobProjection(db, businessId, id).catch(() => undefined)));
}

function emptyDay(workerKey: string, workerName: string, dk: string): WorkerDay {
  return { workerKey, workerName, dayKey: dk, state: "off", officeMs: 0, jobs: {}, anomalies: [] };
}

/** Resolve the punching worker's identity, mirroring verifyFieldAccess's own two paths. A
 *  logged-in session's workerKey is always derived from the verified uid — never trusts a
 *  client-supplied one; a QR/anonymous crew member is identified by name only. */
function resolveWorker(uid: string, bodyWorkerName: unknown): { workerKey: string; workerName: string } | { error: string } {
  const suppliedName = typeof bodyWorkerName === "string" ? bodyWorkerName.trim() : "";
  if (uid.startsWith("field:")) {
    if (!suppliedName) return { error: "workerName required" };
    return { workerKey: `name:${normalizeName(suppliedName)}`, workerName: suppliedName };
  }
  return { workerKey: `uid:${uid}`, workerName: suppliedName || "Team member" };
}

async function loadTodaysPunches(
  db: FirebaseFirestore.Firestore,
  businessId: string,
  workerKey: string,
  todayKey: string,
): Promise<Punch[]> {
  const snap = await db
    .collection(`businesses/${businessId}/punches`)
    .where("workerKey", "==", workerKey)
    .where("dayKey", "==", todayKey)
    .orderBy("at", "asc")
    .get();
  return snap.docs.map((d) => ({ punchId: d.id, ...d.data() })) as Punch[];
}

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  const workerNameParam = req.nextUrl.searchParams.get("workerName");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const jobId = req.nextUrl.searchParams.get("jobId");
  const gate = await verifyFieldAccess(req, businessId, jobId ? { jobId } : { allowOfficePunch: true });
  if ("error" in gate) return gate.error;

  const worker = resolveWorker(gate.user.uid, workerNameParam);
  if ("error" in worker) return NextResponse.json({ error: worker.error }, { status: 400 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const tz = await loadBusinessTz(db, businessId);
  const now = Date.now();
  const todayKey = dayKey(now, tz);
  const punches = await loadTodaysPunches(db, businessId, worker.workerKey, todayKey);
  const days = foldPunches(punches, now, tz);
  const day = days.find((d) => d.dayKey === todayKey) ?? emptyDay(worker.workerKey, worker.workerName, todayKey);

  return NextResponse.json({ day, tz });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { businessId, type, jobId, workerName, closeOpen } = body;

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  if (typeof type !== "string" || !PUNCH_TYPES.has(type as PunchType)) {
    return NextResponse.json({ error: "Invalid punch type" }, { status: 400 });
  }
  const punchType = type as PunchType;
  if (isSitePunch(punchType) && (typeof jobId !== "string" || !jobId)) {
    return NextResponse.json({ error: "jobId required for a jobsite punch" }, { status: 400 });
  }

  const gate = await verifyFieldAccess(
    req,
    businessId,
    jobId && typeof jobId === "string" ? { jobId, write: true } : { allowOfficePunch: true, write: true },
  );
  if ("error" in gate) return gate.error;

  const worker = resolveWorker(gate.user.uid, workerName);
  if ("error" in worker) return NextResponse.json({ error: worker.error }, { status: 400 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const tz = await loadBusinessTz(db, businessId);
  const now = Date.now();
  const todayKey = dayKey(now, tz);
  const punchesCol = db.collection(`businesses/${businessId}/punches`);

  const existing = await loadTodaysPunches(db, businessId, worker.workerKey, todayKey);
  const day = foldPunches(existing, now, tz).find((d) => d.dayKey === todayKey)
    ?? emptyDay(worker.workerKey, worker.workerName, todayKey);

  // Breaks are office actions only while the worker is in the office. At a
  // jobsite they must carry the open job so a pinned QR grant cannot act on
  // another job by omitting jobId from the body.
  if (day.state === "site" || day.state === "site_break") {
    if (punchType === "site_out" || punchType === "break_start" || punchType === "break_end") {
      if (jobId !== day.openJobId) {
        return NextResponse.json({ error: "Current jobId required" }, { status: 403 });
      }
    }
  }

  const makePunch = (t: PunchType, at: number, extra: Partial<Punch> = {}): Punch => ({
    punchId: `pn_${at}_${randomUUID().slice(0, 8)}`,
    businessId,
    workerKey: worker.workerKey,
    workerName: worker.workerName,
    type: t,
    at,
    dayKey: dayKey(at, tz),
    source: "field-app",
    createdAt: Date.now(),
    ...extra,
  });

  // Idempotent no-op: tapping "Arrived Jobsite" again for the SAME job you're already on
  // (a double-tap, a stale page reload) isn't an error — just hand back the current state.
  if (punchType === "site_in" && day.state === "site" && day.openJobId === jobId) {
    return NextResponse.json({ ok: true, day, tz });
  }

  const hadOfficeInToday = existing.some((p) => p.type === "office_in");
  const result = applyPunch(day.state, punchType, { hadOfficeInToday });

  if (!result.ok) {
    const isJobSwitch =
      punchType === "site_in" && (day.state === "site" || day.state === "site_break") && day.openJobId !== jobId;

    if (isJobSwitch && closeOpen === true) {
      // "Switch job" — close the old job and open the new one atomically, same timestamp, so
      // neither the guard nor the invoice ever sees a moment with two open jobs.
      const closePunch = makePunch("site_out", now, { jobId: day.openJobId });
      const openPunch = makePunch("site_in", now, { jobId });
      const batch = db.batch();
      batch.set(punchesCol.doc(closePunch.punchId), closePunch);
      batch.set(punchesCol.doc(openPunch.punchId), openPunch);
      await batch.commit();
      await reprojectJobs(db, businessId, [closePunch.jobId, openPunch.jobId]);
      const newDay = foldPunches([...existing, closePunch, openPunch], now, tz)
        .find((d) => d.dayKey === todayKey)!;
      return NextResponse.json({ ok: true, day: newDay, switched: true, tz });
    }

    return NextResponse.json(
      {
        error: result.error,
        currentState: day.state,
        openJobId: day.openJobId,
        openSince: day.openSince,
        suggestion: isJobSwitch ? "Clock out there and start here?" : undefined,
        tz,
      },
      { status: 409 },
    );
  }

  const writes: Punch[] = [];
  if (result.implicitFirst) writes.push(makePunch(result.implicitFirst, now, { jobId: day.openJobId }));
  writes.push(makePunch(punchType, now, { jobId: isSitePunch(punchType) ? jobId : undefined }));

  const batch = db.batch();
  for (const w of writes) batch.set(punchesCol.doc(w.punchId), w);
  await batch.commit();
  await reprojectJobs(db, businessId, [...writes.map((w) => w.jobId), day.openJobId]);

  const newDay = foldPunches([...existing, ...writes], now, tz).find((d) => d.dayKey === todayKey)!;
  return NextResponse.json({ ok: true, day: newDay, tz });
}
