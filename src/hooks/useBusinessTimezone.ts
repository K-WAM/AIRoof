"use client";

import { useEffect, useState } from "react";
import { getFirebaseDb } from "@/lib/firebase/client";
import { useBusinessId } from "@/hooks/useBusinessId";

// US + Canada timezones. Rendered as a flat <select>, so country is baked into
// each label for scannability. Add other countries here as we expand.
export const SUPPORTED_TIMEZONES = [
  // United States
  { value: "America/New_York",    label: "US – Eastern (New York, Miami, Atlanta)" },
  { value: "America/Chicago",     label: "US – Central (Chicago, Dallas, Houston)" },
  { value: "America/Denver",      label: "US – Mountain (Denver, Salt Lake City)" },
  { value: "America/Phoenix",     label: "US – Mountain, no DST (Phoenix)" },
  { value: "America/Los_Angeles", label: "US – Pacific (Los Angeles, Seattle)" },
  { value: "America/Anchorage",   label: "US – Alaska" },
  { value: "America/Honolulu",    label: "US – Hawaii" },
  { value: "America/Puerto_Rico", label: "US – Atlantic (Puerto Rico, USVI)" },
  // Canada
  { value: "America/Toronto",     label: "Canada – Eastern (Toronto, Ottawa, Montréal)" },
  { value: "America/Winnipeg",    label: "Canada – Central (Winnipeg)" },
  { value: "America/Regina",      label: "Canada – Central, no DST (Saskatchewan)" },
  { value: "America/Edmonton",    label: "Canada – Mountain (Calgary, Edmonton)" },
  { value: "America/Vancouver",   label: "Canada – Pacific (Vancouver, Victoria)" },
  { value: "America/Halifax",     label: "Canada – Atlantic (Halifax)" },
  { value: "America/St_Johns",    label: "Canada – Newfoundland (St. John's)" },
] as const;

const DEFAULT_TZ = "America/New_York";

export function useBusinessTimezone(): string {
  const businessId = useBusinessId();
  const [timezone, setTimezone] = useState<string>(DEFAULT_TZ);

  useEffect(() => {
    if (!businessId) return;

    const cacheKey = `tz_${businessId}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) { setTimezone(cached); return; }
    } catch { /* sessionStorage unavailable (SSR) */ }

    (async () => {
      const db = await getFirebaseDb();
      if (!db) return;
      const { doc, getDoc } = await import("firebase/firestore");
      getDoc(doc(db, "businesses", businessId))
        .then((snap) => {
          const tz = snap.data()?.timezone;
          if (typeof tz === "string" && tz.length > 0) {
            setTimezone(tz);
            try { sessionStorage.setItem(cacheKey, tz); } catch { /* ignore */ }
          }
        })
        .catch(() => {});
    })();
  }, [businessId]);

  return timezone;
}
