// Language detection for the field-update pipeline (Phase 12, Phase 6). Two
// distinct jobs — do not conflate them:
//  - normalizeLang(): Whisper's verbose_json response.language is a full
//    English language NAME ("spanish", "english"), not an ISO code.
//  - detectLanguage(): a cheap heuristic for TYPED text, where there is no
//    Whisper call (and so no model-provided language) at all — accented
//    characters/¿¡ are an unambiguous tell; otherwise a Spanish stopword
//    count. No extra LLM call; ambiguous text returns undefined and lets
//    parseFieldUpdate's own model call decide, rather than force a guess.

const SPANISH_STOPWORDS = new Set([
  "el", "la", "los", "las", "de", "del", "que", "y", "en", "un", "una", "es", "fue", "fueron",
  "para", "con", "por", "se", "su", "sus", "al", "lo", "como", "pero", "muy", "todo",
  "todos", "hay", "esta", "este", "estos", "estas", "tambien", "porque", "cuando",
  "donde", "quien", "hicimos", "puse", "pusimos", "trabajamos", "llegamos", "salimos",
  "arreglamos", "cambie", "cambiamos", "hoy", "ayer", "manana", "gracias", "necesitamos",
]);

/** Whisper's verbose_json `.language` is a full name ("spanish"), not an ISO code. */
export function normalizeLang(whisperLanguage: string | undefined | null): string | undefined {
  if (!whisperLanguage) return undefined;
  const norm = whisperLanguage.trim().toLowerCase();
  if (norm === "spanish" || norm === "es") return "es";
  if (norm === "english" || norm === "en") return "en";
  return norm; // pass through any other language Whisper detects, uninterpreted
}

export function detectLanguage(text: string): "es" | undefined {
  if (!text) return undefined;
  // Accented vowels, ñ, and inverted punctuation are essentially never typed in English —
  // an immediate, unambiguous tell, no stopword count needed.
  if (/[¿¡ñÑáéíóúÁÉÍÓÚ]/.test(text)) return "es";
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  let hits = 0;
  for (const w of words) {
    if (SPANISH_STOPWORDS.has(w)) hits += 1;
    if (hits >= 2) return "es";
  }
  return undefined;
}
