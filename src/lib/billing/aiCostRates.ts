// The ONE place AI/phone unit costs live (owner, 2026-10-04: "estimated AI and ElevenLabs costs … so they can be
// monitored"). The superadmin Usage page multiplies these by real usage; the Playbook's "AI & costs" tab prints them.
// They are ESTIMATES from the providers' public list prices (checked 2026-10-04) — change a number here when a plan or
// price changes, nothing else needs touching. Never shown to clients.

export interface AiCostRate {
  id: "phone_elevenlabs" | "phone_vapi" | "voice_note_transcribe" | "voice_note_read" | "call_summary";
  feature: string;
  model: string;
  /** US dollars per `unit`. */
  usd: number;
  unit: string;
}

export const AI_COST_RATES: AiCostRate[] = [
  { id: "phone_elevenlabs", feature: "Phone calls (live AI receptionist)", model: "ElevenLabs Agents — voice + its LLM", usd: 0.1, unit: "per minute" },
  { id: "phone_vapi", feature: "Phone calls on an older Vapi line", model: "Vapi — gpt-4o-mini + Deepgram + Vapi voice", usd: 0.12, unit: "per minute" },
  { id: "voice_note_transcribe", feature: "Field voice note → text (any language)", model: "OpenAI Whisper (whisper-1)", usd: 0.006, unit: "per minute of audio" },
  { id: "voice_note_read", feature: "Reading a note into materials, labor, issues", model: "OpenAI gpt-4o", usd: 0.01, unit: "per note" },
  { id: "call_summary", feature: "Call summary + outcome", model: "DeepSeek chat (falls back to OpenAI gpt-4o-mini)", usd: 0.002, unit: "per call" },
];

export const rate = (id: AiCostRate["id"]): number => AI_COST_RATES.find((r) => r.id === id)?.usd ?? 0;

/** What one client's month of usage costs us, in dollars (estimate). */
export function estimateMonthCost(u: { phoneMinutes: number; vapiMinutes?: number; voiceNoteMinutes: number; notesRead: number; calls: number }) {
  const phone = u.phoneMinutes * rate("phone_elevenlabs") + (u.vapiMinutes ?? 0) * rate("phone_vapi");
  const ai = u.voiceNoteMinutes * rate("voice_note_transcribe") + u.notesRead * rate("voice_note_read") + u.calls * rate("call_summary");
  return { phone, ai, total: phone + ai };
}
