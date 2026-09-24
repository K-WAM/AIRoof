import type { BusinessConfig, VoiceRef } from "@/types";

/**
 * Voice overrides are opt-in. Without an entry for the selected language,
 * persona pushes leave the dashboard-selected Vapi voice untouched. For example,
 * `{ en: { provider: "11labs", voiceId: "confirmed-id" } }` overrides English
 * only. Confirm each voice ID in the provider dashboard before saving it.
 */
export function voiceForLanguage(
  config: Pick<BusinessConfig, "voice">,
  language: "en" | "es"
): VoiceRef | undefined {
  return config.voice?.[language];
}

const PROVIDERS = new Set(["vapi", "11labs", "cartesia", "openai"]);
const VOICE_ID_PATTERN = /^[A-Za-z0-9_\- ]{1,100}$/;

/** Validate the exact persisted shape; never persist arbitrary caller fields. */
export function isVoiceConfig(value: unknown): value is NonNullable<BusinessConfig["voice"]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const voices = value as Record<string, unknown>;
  if (Object.keys(voices).some((key) => key !== "en" && key !== "es")) return false;
  return Object.values(voices).every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const voice = entry as Record<string, unknown>;
    if (Object.keys(voice).some((key) => !["provider", "voiceId", "model"].includes(key))) return false;
    return typeof voice.provider === "string" && PROVIDERS.has(voice.provider) &&
      typeof voice.voiceId === "string" && VOICE_ID_PATTERN.test(voice.voiceId) &&
      (voice.model === undefined || (typeof voice.model === "string" && voice.model.length <= 60));
  });
}
