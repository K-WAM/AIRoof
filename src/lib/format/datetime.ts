// Shared date/time formatting. Constructing Intl.DateTimeFormat is genuinely
// expensive, and before this module existed it was done ad hoc — sometimes
// inside render loops — in 8+ files (dashboard, calls, pipeline, jobs list,
// job detail (twice, at two different line numbers), CalendarBoard). One
// memoized formatter cache here replaces all of them.

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(key: string, locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    formatterCache.set(key, f);
  }
  return f;
}

/** "Sep 14" — short month + day, in the business's timezone. */
export function fmtDay(ms: number | undefined | null, tz: string, locale = "en-US"): string {
  if (!ms) return "";
  const key = `day|${locale}|${tz}`;
  return getFormatter(key, locale, { month: "short", day: "numeric", timeZone: tz }).format(ms);
}

/** "2:14 PM" — in the business's timezone. */
export function fmtTime(ms: number | undefined | null, tz: string, locale = "en-US"): string {
  if (!ms) return "";
  const key = `time|${locale}|${tz}`;
  return getFormatter(key, locale, { hour: "numeric", minute: "2-digit", timeZone: tz }).format(ms);
}

/** "Sep 14, 2:14 PM" — day + time together, in the business's timezone. */
export function fmtDayTime(ms: number | undefined | null, tz: string, locale = "en-US"): string {
  if (!ms) return "";
  const key = `daytime|${locale}|${tz}`;
  return getFormatter(key, locale, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz,
  }).format(ms);
}

/** "Sep 14, 2026" — full date, in the business's timezone. */
export function fmtDate(ms: number | undefined | null, tz: string, locale = "en-US"): string {
  if (!ms) return "";
  const key = `date|${locale}|${tz}`;
  return getFormatter(key, locale, { month: "short", day: "numeric", year: "numeric", timeZone: tz }).format(ms);
}

/**
 * Business-local calendar date as "YYYY-MM-DD" — load-bearing for the time
 * clock (grouping punches into a day) and any future per-day rollup. Uses
 * en-CA because that locale's short date format IS ISO-8601 (YYYY-MM-DD)
 * natively — no string surgery needed.
 */
export function dayKey(ms: number | undefined | null, tz: string): string {
  const when = ms ?? Date.now();
  const key = `daykey|${tz}`;
  return getFormatter(key, "en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz }).format(when);
}

/** True if `a` and `b` fall on the same business-local calendar day. */
export function isSameDay(a: number, b: number, tz: string): boolean {
  return dayKey(a, tz) === dayKey(b, tz);
}
