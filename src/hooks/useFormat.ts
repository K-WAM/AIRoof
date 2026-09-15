"use client";

import { useCallback } from "react";
import { useBusinessTimezone } from "@/hooks/useBusinessTimezone";
import { fmtDay, fmtTime, fmtDayTime, fmtDate, dayKey } from "@/lib/format";

/**
 * Timezone-bound formatters for the current business — pulls `tz` from
 * BootstrapContext (via useBusinessTimezone) once so call sites don't each
 * re-derive it. Replaces the per-file `fmtDay`/`formatTime`/etc. helpers
 * duplicated across the dashboard, calls, pipeline, jobs, and job-detail pages.
 */
export function useFormat() {
  const tz = useBusinessTimezone();
  return {
    tz,
    fmtDay: useCallback((ms?: number | null) => fmtDay(ms, tz), [tz]),
    fmtTime: useCallback((ms?: number | null) => fmtTime(ms, tz), [tz]),
    fmtDayTime: useCallback((ms?: number | null) => fmtDayTime(ms, tz), [tz]),
    fmtDate: useCallback((ms?: number | null) => fmtDate(ms, tz), [tz]),
    dayKey: useCallback((ms?: number | null) => dayKey(ms, tz), [tz]),
  };
}
