import { useEffect, useRef } from "react";

const IDLE_AFTER_MS = 3 * 60_000;
const IDLE_INTERVAL_MS = 60_000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

export interface LiveRefreshOptions {
  intervalMs: number;
  enabled?: boolean;
  /** True while a local edit buffer would be overwritten by a refresh. */
  isDirty?: boolean;
}

/**
 * Refreshes visible pages without concurrent requests. A focus refresh is
 * useful after a call or field update completes in another browser tab.
 */
export function useLiveRefresh(
  refresh: () => Promise<unknown> | unknown,
  { intervalMs, enabled = true, isDirty = false }: LiveRefreshOptions,
) {
  const refreshRef = useRef(refresh);
  const dirtyRef = useRef(isDirty);
  const inFlightRef = useRef(false);
  refreshRef.current = refresh;
  dirtyRef.current = isDirty;

  useEffect(() => {
    if (!enabled) return;

    let lastActive = Date.now();
    let lastRun = Date.now();
    const run = () => {
      if (document.visibilityState === "hidden" || dirtyRef.current || inFlightRef.current) return;
      inFlightRef.current = true;
      lastRun = Date.now();
      Promise.resolve(refreshRef.current()).finally(() => { inFlightRef.current = false; });
    };
    // A screen nobody has touched for a few minutes (left open on a desk) refreshes once a minute instead of every
    // few seconds — every refresh is Firestore reads against the plan's daily quota. The first touch catches up.
    const tick = () => {
      const idle = Date.now() - lastActive > IDLE_AFTER_MS;
      if (idle && Date.now() - lastRun < Math.max(intervalMs, IDLE_INTERVAL_MS)) return;
      run();
    };
    const onActivity = () => {
      const wasIdle = Date.now() - lastActive > IDLE_AFTER_MS;
      lastActive = Date.now();
      if (wasIdle) run();
    };
    const onVisibility = () => { if (document.visibilityState === "visible") run(); };
    const timer = window.setInterval(tick, intervalMs);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVisibility);
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
    };
  }, [enabled, intervalMs]);
}
