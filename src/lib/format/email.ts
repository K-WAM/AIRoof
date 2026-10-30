// A caller who spells their address letter by letter ("K-W-A-M-W-A-D at gmail dot com") can leave it in a record or a
// call summary with the dashes still in. New bookings are cleaned by normalizeSpokenEmail (toolDispatcher.ts) before
// they are saved; these helpers clean what was saved before that fix and the free-text summaries, so no screen shows —
// and no email is ever sent to — "k-w-a-m-w-a-d@gmail.com".

// Three or more single letters/digits joined by dashes, then the domain — written ("@", ".") or spoken ("at", "dot").
const SPELLED_EMAIL =
  /\b((?:[a-z0-9]-){2,}[a-z0-9])(?:\s*@\s*|\s+(?:at|arroba)\s+)([a-z0-9-]+)(?:\.|\s+(?:dot|punto)\s+)([a-z]{2,})\b/gi;

/** Joins every letter-by-letter spelled email inside free text into one address. Everything else is left untouched. */
export function joinSpelledEmails(text: string): string {
  return text.replace(SPELLED_EMAIL, (_match, local: string, domain: string, tld: string) =>
    `${local.replace(/-/g, "")}@${domain}.${tld}`.toLowerCase());
}

/** A stored email made safe to show and send: trimmed, spelled-out letters joined. Empty in, undefined out. */
export function tidyEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? joinSpelledEmails(trimmed) : undefined;
}
