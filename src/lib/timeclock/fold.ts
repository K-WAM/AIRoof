// Deterministic fold of the punches ledger into per-worker-per-day state — the time-clock
// analogue of src/lib/jobs/projection.ts's buildProjection. Pure: no Firestore, no Date.now()
// except what's passed in, so it's fully unit-testable and the guard/UI/invoice merge all see
// byte-identical numbers for the same ledger.
//
// Anomalies are specified, not hand-waved (docs/PLATFORM-EXPANSION-PLAN.md Phase 5):
//   - missing_out: a past day ends with the clock still running. Closed at the last real punch
//     (zero extra minutes guessed), flagged amber for a one-tap "Set departure" fix.
//   - over_16h: any single accrued span is clamped to 16h and flagged, so one forgotten punch
//     can't silently bill three days.
//   - overlap: the live guard makes this impossible; if an admin edit still produces one, both
//     punches are kept (never silently drop billable time) and the day is flagged.
// Auto-pause on inactivity is deliberately NOT implemented — geofencing/activity heuristics on
// the free plan produce wrong payroll, and wrong payroll loses clients faster than a missed
// punch does. The nightly close-punches cron + missing_out is the honest substitute.

import { dayKey as computeDayKey, fmtTime } from "@/lib/format";
import { applyPunch, accrualKind } from "@/lib/timeclock/machine";
import type { Punch, WorkerDay, WorkerDayAnomaly, PunchedLaborEntry, PunchType } from "@/types/timeclock";

const MAX_SPAN_MS = 16 * 60 * 60 * 1000;

function newDay(workerKey: string, workerName: string, dayKey: string): WorkerDay {
  return { workerKey, workerName, dayKey, state: "off", officeMs: 0, jobs: {}, anomalies: [] };
}

/** Add `ms` of accrued time to the right bucket for whatever was open, clamping a single span to 16h. */
function accrue(day: WorkerDay, kind: "office" | "site", ms: number, jobId: string | undefined, anomalies: WorkerDayAnomaly[]) {
  let span = ms;
  if (span > MAX_SPAN_MS) {
    anomalies.push({ type: "over_16h", jobId, detail: `A span of ${(span / 3_600_000).toFixed(1)}h was clamped to 16h.` });
    span = MAX_SPAN_MS;
  }
  if (kind === "office") {
    day.officeMs += span;
  } else if (jobId) {
    const existing = day.jobs[jobId] ?? { ms: 0 };
    existing.ms += span;
    day.jobs[jobId] = existing;
  }
}

function stampArrival(day: WorkerDay, jobId: string, at: number, tz: string) {
  const entry = day.jobs[jobId] ?? { ms: 0 };
  if (!entry.arrivalTime) entry.arrivalTime = fmtTime(at, tz);
  day.jobs[jobId] = entry;
}

function stampDeparture(day: WorkerDay, jobId: string, at: number, tz: string) {
  const entry = day.jobs[jobId] ?? { ms: 0 };
  entry.departureTime = fmtTime(at, tz);
  day.jobs[jobId] = entry;
}

/**
 * Fold a ledger of punches (any mix of workers/days) into one WorkerDay per
 * (workerKey, dayKey) actually present. Superseded punches (an admin edit's original) are
 * dropped first — same trick buildProjection uses for corrections: zero mutation, full audit
 * trail. `nowMs`/`tz` are only used to (a) accrue a still-open TODAY span live and (b) decide
 * whether an open PAST day is `missing_out` rather than just "in progress."
 */
export function foldPunches(punches: Punch[], nowMs: number, tz: string): WorkerDay[] {
  const superseded = new Set(punches.map((p) => p.supersedes).filter((id): id is string => !!id));
  const live = punches.filter((p) => !superseded.has(p.punchId)).sort((a, b) => a.at - b.at);

  const today = computeDayKey(nowMs, tz);
  const byWorkerDay = new Map<string, WorkerDay>();
  // Track "did this worker have an office_in earlier today" per (workerKey, dayKey) — governs
  // the site_out destination rule.
  const hadOfficeIn = new Map<string, boolean>();

  for (const p of live) {
    const groupKey = `${p.workerKey}|${p.dayKey}`;
    let day = byWorkerDay.get(groupKey);
    if (!day) {
      day = newDay(p.workerKey, p.workerName, p.dayKey);
      byWorkerDay.set(groupKey, day);
    }

    if (p.type === "office_in") hadOfficeIn.set(groupKey, true);

    const result = applyPunch(day.state, p.type, { hadOfficeInToday: hadOfficeIn.get(groupKey) === true });
    const anomalies: WorkerDayAnomaly[] = [];

    const emit = (type: PunchType) => {
      const kind = accrualKind(day!.state);
      if (kind && day!.openSince != null) {
        accrue(day!, kind, p.at - day!.openSince, day!.openJobId, anomalies);
        if (kind === "site" && day!.openJobId) stampDeparture(day!, day!.openJobId, p.at, tz);
      }
      // Apply this edge's own transition (re-running applyPunch per emitted edge keeps a
      // multi-edge punch, e.g. site_out implicitly closing a lunch break first, consistent).
      const step = applyPunch(day!.state, type, { hadOfficeInToday: hadOfficeIn.get(groupKey) === true });
      if (step.ok) {
        const prevJobId = day!.openJobId;
        day!.state = step.nextState;
        // openJobId is a pure function of the new state: job-scoped states keep/set it, every
        // other state (office, break_office, off) clears it — a site_out that returns to
        // "office" must not leave openJobId pointing at the job the worker just left, or the
        // cross-job guard would wrongly think they're still on it.
        day!.openJobId = step.nextState === "site" || step.nextState === "site_break"
          ? (type === "site_in" ? p.jobId : prevJobId)
          : undefined;
        if (accrualKind(step.nextState)) {
          day!.openSince = p.at;
          if (type === "site_in" && p.jobId) stampArrival(day!, p.jobId, p.at, tz);
        } else {
          day!.openSince = undefined;
        }
      } else {
        anomalies.push({ type: "overlap", jobId: p.jobId, detail: step.error });
      }
    };

    if (!result.ok) {
      // The live guard makes this unreachable; an admin edit could still create it. Coerce to
      // the state the punch itself implies rather than dropping it — never silently lose
      // billable time — and flag it.
      anomalies.push({ type: "overlap", jobId: p.jobId, detail: result.error });
      if (p.type === "site_in") {
        day.state = "site"; day.openSince = p.at; day.openJobId = p.jobId;
        if (p.jobId) stampArrival(day, p.jobId, p.at, tz);
      } else if (p.type === "office_in") {
        day.state = "office"; day.openSince = p.at; day.openJobId = undefined;
      } else if (p.type === "site_out" || p.type === "office_out") {
        if (day.openSince != null) {
          const kind = accrualKind(day.state);
          if (kind) accrue(day, kind, p.at - day.openSince, day.openJobId, anomalies);
          if (kind === "site" && day.openJobId) stampDeparture(day, day.openJobId, p.at, tz);
        }
        day.state = "off"; day.openSince = undefined; day.openJobId = undefined;
      }
      // break_start/break_end with no legal source state: leave state untouched, just flagged.
    } else {
      if (result.implicitFirst) emit(result.implicitFirst);
      emit(p.type);
    }

    day.anomalies.push(...anomalies);
    day.lastPunchAt = p.at;
    day.lastPunchType = p.type;
  }

  // Second pass: resolve whatever's still open at the end of each worker-day.
  for (const day of byWorkerDay.values()) {
    const kind = accrualKind(day.state);
    if (!kind || day.openSince == null) continue;

    if (day.dayKey === today) {
      // Still legitimately in progress — accrue live elapsed time for display, flag only if
      // it's already run past a sane single-day ceiling (the 23:59 cron should have caught a
      // genuinely stale open punch by now; this is defense-in-depth, not the primary guard).
      accrue(day, kind, nowMs - day.openSince, day.openJobId, day.anomalies);
      if (kind === "site" && day.openJobId) stampDeparture(day, day.openJobId, nowMs, tz);
    } else {
      // A past day that never closed. Never guess a departure: close it at the last real punch
      // (zero extra minutes) and flag it for a one-tap fix.
      day.anomalies.push({
        type: "missing_out",
        jobId: day.openJobId,
        detail: "This day never got a closing punch — hours stop at the last recorded punch.",
      });
      day.openSince = undefined;
    }
  }

  return [...byWorkerDay.values()];
}

/** Flatten every WorkerDay's time on one job into invoice/labor-tab-ready entries. */
export function punchedLaborForJob(days: WorkerDay[], jobId: string): PunchedLaborEntry[] {
  const out: PunchedLaborEntry[] = [];
  for (const day of days) {
    const job = day.jobs[jobId];
    if (!job || job.ms <= 0) continue;
    out.push({
      workerKey: day.workerKey,
      workerName: day.workerName,
      dayKey: day.dayKey,
      hours: Math.round((job.ms / 3_600_000) * 100) / 100,
      arrivalTime: job.arrivalTime,
      departureTime: job.departureTime,
    });
  }
  return out;
}
