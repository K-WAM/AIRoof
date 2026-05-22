// Twilio <Say> voice mapping.
// We prefer Amazon Polly Neural voices — they sound dramatically more human
// than Twilio's classic "alice/man/woman" voices. Polly works natively in TwiML.
// Format: <Say voice="Polly.Matthew-Neural">...</Say>
//
// Voice catalog (defaults for our app):
//   Male:   Polly.Matthew-Neural (US), Polly.Brian-Neural (UK)
//   Female: Polly.Joanna-Neural (US), Polly.Amy-Neural (UK)

const POLLY_PREFIX = "Polly.";
const LEGACY_TWILIO_VOICES = new Set(["alice", "man", "woman"]);

// Default fallback: human-sounding male voice for Roofus.
const DEFAULT_VOICE = "Polly.Matthew-Neural";

const APP_TO_TWILIO_SAY_VOICE: Record<string, string> = {
  // OpenAI voice names → closest Polly equivalent
  alloy: "Polly.Matthew-Neural",
  ash: "Polly.Matthew-Neural",
  ballad: "Polly.Joanna-Neural",
  coral: "Polly.Joanna-Neural",
  echo: "Polly.Matthew-Neural",
  fable: "Polly.Brian-Neural",
  nova: "Polly.Joanna-Neural",
  onyx: "Polly.Matthew-Neural",
  sage: "Polly.Joanna-Neural",
  shimmer: "Polly.Joanna-Neural",
  verse: "Polly.Matthew-Neural",
  // Gendered shortcuts
  male: "Polly.Matthew-Neural",
  female: "Polly.Joanna-Neural",
  man: "Polly.Matthew-Neural",
  woman: "Polly.Joanna-Neural",
  // Legacy Twilio names → Polly upgrade
  alice: "Polly.Joanna-Neural",
};

export function getTwilioSayVoice(agentVoice?: string | null): string {
  const raw = agentVoice?.trim();
  if (!raw) return DEFAULT_VOICE;

  // Pass-through any Polly voice the business explicitly set
  if (raw.startsWith(POLLY_PREFIX)) return raw;

  const normalized = raw.toLowerCase();
  if (APP_TO_TWILIO_SAY_VOICE[normalized]) return APP_TO_TWILIO_SAY_VOICE[normalized];

  // Last resort: legacy Twilio voice (still works, just sounds robotic)
  if (LEGACY_TWILIO_VOICES.has(normalized)) return normalized;

  return DEFAULT_VOICE;
}
