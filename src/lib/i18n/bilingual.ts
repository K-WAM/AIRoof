// English AND Spanish, always (owner, 2026-10-04). There is no language setting: every phone line answers in English,
// understands both, and follows the caller into Spanish and back mid-sentence. Field voice notes are the same.

export const CALL_LANGUAGES = ["en", "es"] as const;
/** The language a call starts in; the agent switches the moment the caller speaks Spanish. */
export const CALL_START_LANGUAGE = "en" as const;

const SPANISH_INVITE = "También hablamos español.";

/** Adds one short Spanish line to the greeting so a Spanish speaker knows they can just talk — once, never twice. */
export function withSpanishInvite(greeting: string): string {
  const g = greeting.trim();
  if (!g || /español|espanol/i.test(g)) return g;
  return `${g} ${SPANISH_INVITE}`;
}

const DEFAULT_OPENING_QUESTION = "How can I help you today?";

/**
 * The phone greeting, built so the caller knows when to talk (owner, 2026-10-31: "I'm unclear at what point I'm
 * supposed to start talking"): hello → recording notice → one Spanish line → the question, ALWAYS last. A greeting
 * that already ends with a question keeps its own; one that doesn't gets "How can I help you today?".
 */
export function phoneGreeting(hello: string, notice?: string | null): string {
  const sentences = hello.trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  if (sentences.length === 0) return "";
  const question = /\?$/.test(sentences[sentences.length - 1]) ? sentences.pop()! : DEFAULT_OPENING_QUESTION;
  const parts = [...sentences, notice?.trim() || ""];
  if (!/español|espanol/i.test(hello)) parts.push(SPANISH_INVITE);
  parts.push(question);
  return parts.filter(Boolean).join(" ");
}

// ElevenLabs voice models that can only speak English → the multilingual model of the same family. A line set to an
// English-only model can never answer in Spanish, whatever the prompt says.
const ENGLISH_ONLY_MODELS: Record<string, string> = {
  eleven_turbo_v2: "eleven_turbo_v2_5",
  eleven_flash_v2: "eleven_flash_v2_5",
  eleven_monolingual_v1: "eleven_multilingual_v2",
  eleven_english_sts_v2: "eleven_multilingual_sts_v2",
};

export function multilingualModel(model: string | undefined): string | undefined {
  return model ? ENGLISH_ONLY_MODELS[model] ?? model : model;
}
