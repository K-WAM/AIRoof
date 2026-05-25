"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useBusinessId } from "@/hooks/useBusinessId";

export const US_TIMEZONES = [
  { value: "America/New_York",    label: "Eastern (New York, Miami, Atlanta)" },
  { value: "America/Chicago",     label: "Central (Chicago, Dallas, Houston)" },
  { value: "America/Denver",      label: "Mountain (Denver, Salt Lake City)" },
  { value: "America/Phoenix",     label: "Mountain – no daylight saving (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles, Seattle)" },
  { value: "America/Anchorage",   label: "Alaska" },
  { value: "America/Honolulu",    label: "Hawaii" },
  { value: "America/Puerto_Rico", label: "Atlantic (Puerto Rico, USVI)" },
] as const;

export const DEFAULT_TZ = "America/New_York";

export function useBusinessTimezone(): string {
  const businessId = useBusinessId();
  const [timezone, setTimezone] = useState<string>(DEFAULT_TZ);

  useEffect(() => {
    if (!db || !businessId) return;
    getDoc(doc(db, "businesses", businessId))
      .then((snap) => {
        const tz = snap.data()?.timezone;
        if (typeof tz === "string" && tz.length > 0) setTimezone(tz);
      })
      .catch(() => {});
  }, [businessId]);

  return timezone;
}
