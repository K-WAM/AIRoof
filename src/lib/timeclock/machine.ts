// Pure punch state machine — no Firestore, no dates-as-strings, no I/O. Both the live
// cross-job guard (src/app/api/timeclock/punch/route.ts) and the offline fold
// (src/lib/timeclock/fold.ts) drive the same table, so "what's a legal next punch" can never
// drift between the two call sites.
//
// See docs/PLATFORM-EXPANSION-PLAN.md's Phase 5 for the transition diagram this implements.

import type { ClockState, PunchType } from "@/types/timeclock";

export interface TransitionResult {
  ok: true;
  nextState: ClockState;
  /** An edge the caller must also record, same timestamp, BEFORE the requested punch —
   *  e.g. going straight from the office to a job site closes the office day implicitly. */
  implicitFirst?: PunchType;
}

export interface TransitionFailure {
  ok: false;
  error: string;
}

/**
 * `hadOfficeInToday`: did this worker already have an office_in punch earlier the same
 * dayKey? Governs the site_out destination per the spec's rule: a site departure returns to
 * "office" only if the worker's day actually started at the office; otherwise straight to "off".
 */
export function applyPunch(
  state: ClockState,
  type: PunchType,
  ctx: { hadOfficeInToday: boolean },
): TransitionResult | TransitionFailure {
  switch (state) {
    case "off":
      if (type === "office_in") return { ok: true, nextState: "office" };
      if (type === "site_in") return { ok: true, nextState: "site" }; // drove straight to the job
      return { ok: false, error: `Cannot ${type} while off the clock` };

    case "office":
      if (type === "site_in") return { ok: true, nextState: "site", implicitFirst: "office_out" };
      if (type === "break_start") return { ok: true, nextState: "break_office" };
      if (type === "office_out") return { ok: true, nextState: "off" };
      return { ok: false, error: `Cannot ${type} while in the office` };

    case "site":
      if (type === "break_start") return { ok: true, nextState: "site_break" };
      if (type === "site_out") return { ok: true, nextState: ctx.hadOfficeInToday ? "office" : "off" };
      if (type === "office_out") return { ok: true, nextState: "off" }; // straight home from site
      return { ok: false, error: `Cannot ${type} while on a jobsite` };

    case "break_office":
      if (type === "break_end") return { ok: true, nextState: "office" };
      return { ok: false, error: `Cannot ${type} on office lunch break` };

    case "site_break":
      if (type === "break_end") return { ok: true, nextState: "site" };
      if (type === "site_out") {
        return { ok: true, nextState: ctx.hadOfficeInToday ? "office" : "off", implicitFirst: "break_end" };
      }
      return { ok: false, error: `Cannot ${type} on jobsite lunch break` };

    default:
      return { ok: false, error: "Unknown clock state" };
  }
}

/** True if `type` is one of the two shop-level (never job-scoped) punches. */
export function isOfficePunch(type: PunchType): boolean {
  return type === "office_in" || type === "office_out";
}

/** True if `type` requires a jobId. */
export function isSitePunch(type: PunchType): boolean {
  return type === "site_in" || type === "site_out";
}

/** Which broad clock the state is currently accruing time against, if any. */
export function accrualKind(state: ClockState): "office" | "site" | null {
  if (state === "office") return "office";
  if (state === "site") return "site";
  return null; // "off", "break_office", "site_break" all pause accrual
}
