import { useEffect, useRef } from "react";

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

    const run = () => {
      if (document.visibilityState === "hidden" || dirtyRef.current || inFlightRef.current) return;
      inFlightRef.current = true;
      Promise.resolve(refreshRef.current()).finally(() => { inFlightRef.current = false; });
    };
    const onVisibility = () => { if (document.visibilityState === "visible") run(); };
    const timer = window.setInterval(run, intervalMs);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs]);
}
