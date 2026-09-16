// Language-specific voice selection (Phase 12, Phase 6 — Spanish). Deliberately NOT wired up
// yet: this repo has no confirmed-working Spanish voiceId to switch to. The live English voice
// (Vapi Voices v2 "Savannah", per CLAUDE.md's 2026-09-07 rollback note) is a "vapi" provider
// voice; picking a real Spanish equivalent needs a human pass in the Vapi dashboard's voice
// picker to confirm an actual voiceId that exists and sounds right — guessing one here risks
// silently breaking a live phone line the next time someone flips the Settings language toggle.
//
// Until this is filled in, updateAssistantPersona() only switches the transcriber's `language`
// and the system prompt/greeting — the voice itself is left exactly as it was. Most TTS voices
// can still render Spanish text reasonably under an English-sounding name, so this is a real,
// working degradation rather than a broken one; it's just not the ideal native-accent voice the
// full spec called for.
//
// NEEDS-HUMAN: confirm a real Vapi voiceId for Spanish (dashboard → Voice → filter by language),
// then fill in the "es" entry below and pass `voice` through from updateAssistantPersona's caller.
export const AGENT_VOICES: Partial<Record<"en" | "es", { provider: string; voiceId: string }>> = {
  en: { provider: "vapi", voiceId: "Savannah" },
  // es: not set — see the NEEDS-HUMAN note above.
};
