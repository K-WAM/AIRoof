// Pure helpers for the ElevenLabs conversation-initiation webhook (T-111b).
//
// Kept free of HTTP/Firestore so the response shape is unit-testable. The
// route handles auth, tenant resolution, and record persistence; this module
// turns a tenant's BusinessConfig into the `conversation_initiation_client_data`
// response ElevenLabs documents (re-verified 2026-09-24 against
// https://elevenlabs.io/docs/eleven-agents/customization/personalization/
// twilio-personalization):
//
//   {
//     type: "conversation_initiation_client_data",
//     conversation_config_override: {
//       agent: { prompt: { prompt }, first_message, language },
//       tts: { voice_id }   // only when a T-103 "11labs" voice is configured
//     },
//     dynamic_variables: { ... }
//   }
//
// It mirrors what the Vapi `assistant-request` path injects (same date/after-
// hours context, same buildAgentPrompt call, same T-102 disclosure composition)
// so the two providers behave identically per tenant.

import type { BusinessConfig } from "@/types";
import { buildAgentPrompt } from "@/lib/ai/agentPromptBuilder";
import {
  composeGreetingWithDisclosure,
  resolveRecordingDisclosure,
} from "@/lib/recordingDisclosure";
import { voiceForLanguage } from "@/lib/vapi/voices";

export const DEFAULT_ELEVENLABS_TIMEZONE = "America/New_York";

export interface ElevenLabsInitiationResponse {
  type: "conversation_initiation_client_data";
  conversation_config_override: {
    agent?: {
      prompt?: { prompt: string };
      first_message?: string;
      language?: string;
    };
    tts?: { voice_id: string };
  };
  dynamic_variables: Record<string, string>;
}

/**
 * Same after-hours logic as the Vapi webhook's checkAfterHours, on a plain
 * BusinessConfig instead of a Firestore doc. "Closed"/missing day and times
 * outside "HH:MM - HH:MM" are after hours.
 */
export function isAfterHoursNow(
  businessHours: BusinessConfig["businessHours"],
  timezone: string | undefined,
  now: Date = new Date()
): boolean {
  try {
    const hours: Record<string, string> =
      typeof businessHours === "object" && businessHours !== null
        ? (businessHours as Record<string, string>)
        : {};
    const tz = timezone || DEFAULT_ELEVENLABS_TIMEZONE;

    const dayName = now.toLocaleDateString("en-US", { timeZone: tz, weekday: "long" });
    const todayHours = hours[dayName];
    if (!todayHours || todayHours.toLowerCase() === "closed") return true;

    const m = todayHours.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
    if (!m) return false;
    const openH = parseInt(m[1]), openM = parseInt(m[2]);
    const closeH = parseInt(m[3]), closeM = parseInt(m[4]);

    const localTime = new Date(now.toLocaleString("en-US", { timeZone: tz }));
    const currentMins = localTime.getHours() * 60 + localTime.getMinutes();
    const openMins = openH * 60 + openM;
    const closeMins = closeH * 60 + closeM;
    return currentMins < openMins || currentMins >= closeMins;
  } catch {
    return false;
  }
}

export function afterHoursNote(isAfterHours: boolean): string {
  return isAfterHours
    ? "NOTE: It is currently after business hours, but you MUST still help the caller fully. You can and should book appointments for the next available business-hours slot — never turn a caller away. Tell them their appointment is booked and the team will confirm in the morning."
    : "Business is currently open.";
}

export interface InitiationRuntimeContext {
  currentDate: string;
  currentTime: string;
  timezone: string;
  afterHoursContext: string;
  isAfterHours: boolean;
  callerPhone?: string;
}

export function buildInitiationRuntimeContext(
  config: BusinessConfig,
  callerPhone: string | undefined,
  now: Date = new Date()
): InitiationRuntimeContext {
  const timezone = config.timezone || DEFAULT_ELEVENLABS_TIMEZONE;
  const isAfterHours = isAfterHoursNow(config.businessHours, config.timezone, now);
  return {
    currentDate: now.toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: timezone,
    }),
    currentTime: now.toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", timeZone: timezone,
    }),
    timezone,
    afterHoursContext: afterHoursNote(isAfterHours),
    isAfterHours,
    callerPhone,
  };
}

/**
 * Build the per-call initiation response for a KNOWN tenant. Empty overrides
 * are omitted (never sent as blank strings) so a config read failure leaves
 * the agent's dashboard prompt/greeting standing instead of blanking it.
 */
export function buildInitiationResponse(
  config: BusinessConfig,
  callerPhone: string | undefined,
  now: Date = new Date()
): ElevenLabsInitiationResponse {
  const runtime = buildInitiationRuntimeContext(config, callerPhone, now);

  let systemPrompt = "";
  let greeting = "";
  try {
    systemPrompt = buildAgentPrompt(config, {
      runtime: {
        currentDate: runtime.currentDate,
        currentTime: runtime.currentTime,
        timezone: runtime.timezone,
        afterHoursNote: runtime.afterHoursContext,
        callerPhone: runtime.callerPhone,
      },
    });
    const baseGreeting =
      runtime.isAfterHours && config.afterHoursGreeting
        ? config.afterHoursGreeting
        : (config.greeting ?? "");
    // A notice alone would replace the agent's configured greeting. Match the
    // sync-personas rule: only override when the tenant has greeting copy.
    if (baseGreeting.trim()) {
      greeting = composeGreetingWithDisclosure(
        baseGreeting,
        resolveRecordingDisclosure(config)
      );
    }
  } catch (error) {
    console.error("elevenlabs initiation: failed to build dynamic prompt", error);
  }

  const language = config.agentLanguage ?? "en";
  // T-103: only a configured ElevenLabs-hosted voice overrides the dashboard TTS.
  const voice =
    language === "es" ? voiceForLanguage(config, "es") : voiceForLanguage(config, "en");
  const ttsVoiceId = voice?.provider === "11labs" ? voice.voiceId : undefined;

  const agent: ElevenLabsInitiationResponse["conversation_config_override"]["agent"] = {};
  if (systemPrompt) agent.prompt = { prompt: systemPrompt };
  if (greeting) agent.first_message = greeting;
  agent.language = language;

  const override: ElevenLabsInitiationResponse["conversation_config_override"] = {
    agent,
    ...(ttsVoiceId ? { tts: { voice_id: ttsVoiceId } } : {}),
  };

  return {
    type: "conversation_initiation_client_data",
    conversation_config_override: override,
    dynamic_variables: {
      currentDate: runtime.currentDate,
      currentTime: runtime.currentTime,
      currentTimezone: runtime.timezone,
      afterHoursContext: runtime.afterHoursContext,
      ...(runtime.callerPhone ? { callerPhone: runtime.callerPhone } : {}),
    },
  };
}

/**
 * Fail-safe response for an UNKNOWN tenant: lets the agent's dashboard config
 * answer the call and leaks no tenant information. Always 200 — the call must
 * not be blocked because a tenant lookup failed.
 */
export function genericInitiationResponse(): ElevenLabsInitiationResponse {
  return {
    type: "conversation_initiation_client_data",
    conversation_config_override: {},
    dynamic_variables: {},
  };
}
