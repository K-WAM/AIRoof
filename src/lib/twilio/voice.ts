const TWILIO_SAY_VOICES = new Set(["alice", "man", "woman"]);

const APP_TO_TWILIO_SAY_VOICE: Record<string, string> = {
  alloy: "alice",
  ash: "alice",
  ballad: "alice",
  coral: "alice",
  echo: "man",
  fable: "alice",
  nova: "woman",
  onyx: "man",
  sage: "alice",
  shimmer: "woman",
  verse: "alice",
};

export function getTwilioSayVoice(agentVoice?: string | null): string {
  const normalized = agentVoice?.trim().toLowerCase();

  if (!normalized) return "alice";
  if (TWILIO_SAY_VOICES.has(normalized)) return normalized;

  return APP_TO_TWILIO_SAY_VOICE[normalized] ?? "alice";
}
