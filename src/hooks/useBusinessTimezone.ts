"use client";

import { useBootstrap } from "@/contexts/BootstrapContext";

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

/**
 * A thin selector over BootstrapContext (see useBusinessModules.ts — same
 * migration, same single fetch/cache shared between the two). Kept as its
 * own hook because ~10 call sites import it by this name.
 */
export function useBusinessTimezone(): string {
  const { data } = useBootstrap();
  return data?.business.timezone ?? DEFAULT_TZ;
}
