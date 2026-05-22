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

// Default fallback: AWS's highest-quality "Generative" tier male voice for Roofus.
// Twilio docs: "most human-like, emotionally engaged, optimal for Conversational AI."
const DEFAULT_VOICE = "Polly.Matthew-Generative";

const APP_TO_TWILIO_SAY_VOICE: Record<string, string> = {
  // OpenAI voice names → closest Polly Generative equivalent
  alloy: "Polly.Matthew-Generative",
  ash: "Polly.Matthew-Generative",
  ballad: "Polly.Joanna-Generative",
  coral: "Polly.Joanna-Generative",
  echo: "Polly.Matthew-Generative",
  fable: "Polly.Brian-Generative",
  nova: "Polly.Joanna-Generative",
  onyx: "Polly.Stephen-Generative",
  sage: "Polly.Joanna-Generative",
  shimmer: "Polly.Ruth-Generative",
  verse: "Polly.Matthew-Generative",
  // Gendered shortcuts
  male: "Polly.Matthew-Generative",
  female: "Polly.Joanna-Generative",
  man: "Polly.Matthew-Generative",
  woman: "Polly.Joanna-Generative",
  // Legacy Twilio names → Polly Generative upgrade
  alice: "Polly.Joanna-Generative",
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
