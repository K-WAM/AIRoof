"use client";

import { useEffect, useState } from "react";
import { isNewRequest } from "@/lib/pipeline/requestReview";
import { useBusinessModules } from "@/hooks/useBusinessModules";

/**
 * How many requests are waiting for review in Pipeline (new leads + requested bookings) — for empty
 * states whose one button should say where the work is ("Review requests (3)"). Fetches only while
 * `enabled`, so a populated screen never pays for it. Fails quiet to 0.
 */
export function useWaitingRequests(businessId: string | null, wanted: boolean): number {
  const [count, setCount] = useState(0);
  // Requests come from the AI phone line; a client without that product has none to review.
  const { isEnabled, ready } = useBusinessModules();
  const enabled = wanted && ready && isEnabled("calls");
  useEffect(() => {
    if (!enabled || !businessId) return;
    let cancelled = false;
    const base = `/api/businesses/${encodeURIComponent(businessId)}`;
    Promise.all([
      fetch(`${base}/leads?limit=50`).then((r) => (r.ok ? r.json() : {})),
      fetch(`${base}/appointments?pending=1`).then((r) => (r.ok ? r.json() : {})),
    ])
      .then(([leadData, apptData]: Array<{ leads?: Array<{ status: string }>; appointments?: Array<{ status: string }> }>) => {
        if (cancelled) return;
        setCount([...(leadData.leads ?? []), ...(apptData.appointments ?? [])].filter((r) => isNewRequest(r.status)).length);
      })
      .catch(() => { if (!cancelled) setCount(0); });
    return () => { cancelled = true; };
  }, [businessId, enabled]);
  return count;
}
