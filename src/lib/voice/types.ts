// Voice-provider seam (Phase 19, T-111). SHARED CONTRACT between the two T-111 workers — do not change
// without the integrator; extend with OPTIONAL fields only.
//
// Goal: a tenant's phone line can be answered by Vapi (today, the default) OR ElevenLabs Agents, chosen per
// business by `BusinessConfig.voiceProvider` ("vapi" | "elevenlabs"; missing = "vapi"). Everything that is not
// the phone call itself — field notes (Whisper + GPT-4o), invoices, reports, the 7 booking tools in
// `src/lib/tools/agentTools.ts` — is provider-independent and must stay that way.
//
// Two operations are provider-specific and go through this interface:
//   1. pushPersona      — make the provider's live agent speak this greeting/prompt (Vapi: PATCH assistant;
//                         ElevenLabs: PATCH agent, and/or per-call overrides returned by the initiation webhook)
//   2. startOutboundCall — place a call (callbacks, follow-up cron)
// Inbound events arrive on provider-specific webhook routes:
//   /api/webhooks/vapi (existing)   /api/webhooks/elevenlabs/{initiation|tools/[tool]|post-call} (new, T-111b)

import type { BusinessConfig } from "@/types";

export type VoiceProviderId = NonNullable<BusinessConfig["voiceProvider"]>;

export const DEFAULT_VOICE_PROVIDER: VoiceProviderId = "vapi";

/** Missing or unrecognised values fall back to Vapi — fail-safe: an unconfigured tenant never changes provider. */
export function voiceProviderOf(config: Pick<BusinessConfig, "voiceProvider">): VoiceProviderId {
  return config.voiceProvider === "elevenlabs" ? "elevenlabs" : DEFAULT_VOICE_PROVIDER;
}

export interface PersonaPushInput {
  /** Full tenant config: the provider picks its own ids (vapiAssistantId / elevenlabs.agentId) and any voice override. */
  config: BusinessConfig;
  /** Greeting with the T-102 recording notice ALREADY composed in. */
  firstMessage: string;
  systemPrompt: string;
  /** Set only when the language actually changed (a notice-only save must not touch speech recognition). */
  language?: "en" | "es";
}

export interface OutboundCallInput {
  config: BusinessConfig;
  /** E.164 number to call. */
  targetPhone: string;
  /** Free-form values the agent can use ({{name}}-style variables) and that come back on the call record. */
  variables?: Record<string, string>;
  /** Overrides the spoken first message for this call only. */
  firstMessage?: string;
  /** ISO-8601. A provider that cannot schedule must throw `UnsupportedVoiceFeatureError`, never silently call now. */
  scheduledAt?: string;
}

export interface OutboundCallResult {
  /** Provider's call/conversation id. */
  callId: string;
}

export class UnsupportedVoiceFeatureError extends Error {
  constructor(feature: string, provider: VoiceProviderId) {
    super(`${provider} does not support ${feature}`);
    this.name = "UnsupportedVoiceFeatureError";
  }
}

export interface VoiceProvider {
  readonly id: VoiceProviderId;
  /** True when this tenant has everything this provider needs (ids attached, API key present). */
  isConfigured(config: BusinessConfig): boolean;
  pushPersona(input: PersonaPushInput): Promise<void>;
  startOutboundCall(input: OutboundCallInput): Promise<OutboundCallResult>;
}
