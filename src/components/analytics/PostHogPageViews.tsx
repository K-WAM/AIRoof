"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function PostHogPageViews() {
  const pathname = usePathname();
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || process.env.NEXT_PUBLIC_POSTHOG_HOST !== "https://us.i.posthog.com" || window.location.hostname !== "crm.luxordev.com") return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    // Effects run after hydration; the SDK and its recorder are never first-load imports.
    const load = () => { void import("@/lib/analytics/runtime").then(({ startAnalytics }) => {
      if (!cancelled) stop = startAnalytics();
    }).catch(() => {}); };
    const timer = setTimeout(load, 0);
    return () => { cancelled = true; clearTimeout(timer); stop?.(); };
  }, [pathname]);
  return null;
}
