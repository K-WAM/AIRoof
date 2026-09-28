// Open start times for one crew on one day — the Calendar's drop popup (T-149). Pure, so it's unit-tested without
// Firestore. Deliberately NOT in src/lib/scheduling (the phone AI's booking engine): this only lists what the office
// can pick; POST /api/jobs/[jobId]/assign's overlap guard stays the one authority that accepts or refuses a time.

export interface BusyRange {
  start: number;
  end: number;
}

export const OPEN_TIME_STEP_MS = 30 * 60 * 1000;

/**
 * Every start on a `stepMs` grid from the window's opening where a job of `durationMs` fits before closing, overlaps
 * nothing in `busy`, and is not before `notBefore` (so a dispatcher is never offered a time that has already passed).
 */
export function openStartTimes(options: {
  window: { startTime: number; endTime: number };
  busy: BusyRange[];
  durationMs: number;
  stepMs?: number;
  notBefore?: number;
}): number[] {
  const { window, busy, durationMs } = options;
  const stepMs = options.stepMs ?? OPEN_TIME_STEP_MS;
  if (!(durationMs > 0) || !(stepMs > 0) || window.endTime <= window.startTime) return [];
  const starts: number[] = [];
  for (let start = window.startTime; start + durationMs <= window.endTime; start += stepMs) {
    if (options.notBefore !== undefined && start < options.notBefore) continue;
    const end = start + durationMs;
    if (busy.some((range) => start < range.end && end > range.start)) continue;
    starts.push(start);
  }
  return starts;
}
