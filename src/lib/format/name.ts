// Name/text normalization shared by customer search (Phase 2), the time
// clock's workerKey derivation (Phase 5), and anywhere else that needs to
// match "José" against "jose" or collapse stray whitespace before comparing.

/**
 * Diacritic-fold + lowercase + collapse whitespace. "José   Martínez" and
 * "jose martinez" normalize to the same string — required so Spanish names
 * are searchable/matchable without accents, and so voice-transcribed worker
 * names ("Jose" from Whisper) match a punch-clock name ("José" typed once by
 * an admin).
 */
export function normalizeName(s: string | undefined | null): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Digits only — for matching phone numbers regardless of formatting. */
export function digitsOnly(s: string | undefined | null): string {
  return (s ?? "").replace(/\D/g, "");
}
