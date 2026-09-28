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

// One leading filler a caller says before their name ("It's Carla", "Es Carla", "Me llamo Carla"). Ordered so the
// longer phrases win; every entry is matched as a whole word, so "Esther" and "Soyla" are never mistaken for "Es"/"Soy".
const CALLER_NAME_FILLERS = [
  "my name is",
  "this is",
  "me llamo",
  "it's",
  "i'm",
  "it is",
  "i am",
  "its",
  "es",
  "soy",
] as const;

/**
 * Strip ONE leading filler from a caller-provided name ("Es Carla Esnaida" → "Carla Esnaida", "It's Kareem Awad" →
 * "Kareem Awad"). Case-insensitive, tolerates trailing punctuation. Returns the trimmed input unchanged when no
 * filler matches or when stripping would leave nothing ("Es"). The rest of the name is never touched.
 */
export function cleanCallerName(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return trimmed;
  const normalized = trimmed.replace(/[\u2018\u2019]/g, "'");
  const match = normalized.match(
    new RegExp(`^(?:${CALLER_NAME_FILLERS.join("|")})\\b[\\s.,;:!?'"-]*`, "i"),
  );
  if (!match) return trimmed;
  const remainder = normalized.slice(match[0].length).trim();
  return /\S/.test(remainder) ? remainder : trimmed;
}
