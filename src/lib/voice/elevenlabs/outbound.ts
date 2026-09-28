// Placing an ElevenLabs call FROM a tenant's line (Pipeline "Call Back", the AI confirmation call, Demo
// Studio's "Test call").
//
// An inbound call gets its per-tenant prompt, greeting and dynamic variables from our initiation webhook,
// and that webhook also records the conversation so the tools and post-call routes know the tenant. An
// outbound call never goes through that webhook, so this helper does both jobs itself: the same
// buildInitiationResponse() output is sent as the call's override, and the conversation record is written
// as soon as ElevenLabs returns the conversation id (the customer is still ringing, so no tool call can
// arrive first). Before 2026-09-28 outbound calls sent only a greeting: after "hello" the agent ran on its
// stored dashboard prompt, and a booking made on the call could not be matched to any business.

import type { BusinessConfig } from "@/types";
import type { OutboundCallResult } from "../types";
import { buildInitiationResponse } from "./initiationConfig";
import { elevenLabsVoiceProvider } from "./client";
import { persistElevenLabsConversation } from "./conversationRecords";

export interface ElevenLabsOutboundInput {
  businessId: string;
  config: BusinessConfig;
  targetPhone: string;
  /** Replaces the tenant greeting (it must already include the recording notice). */
  firstMessage?: string;
  /** Appended to the tenant prompt, e.g. "you are calling to confirm …". */
  promptSection?: string;
  metadata?: Record<string, string>;
  variables?: Record<string, string>;
  now?: Date;
}

export async function placeElevenLabsOutboundCall(input: ElevenLabsOutboundInput): Promise<OutboundCallResult> {
  const initiation = buildInitiationResponse(input.config, input.targetPhone, input.now ?? new Date());
  const agent = initiation.conversation_config_override.agent;
  const basePrompt = agent?.prompt?.prompt;
  const systemPrompt = basePrompt && input.promptSection ? `${basePrompt}\n\n${input.promptSection}` : basePrompt;
  const firstMessage = input.firstMessage ?? agent?.first_message;

  const call = await elevenLabsVoiceProvider.startOutboundCall({
    config: input.config,
    targetPhone: input.targetPhone,
    metadata: input.metadata,
    variables: { ...initiation.dynamic_variables, ...input.variables },
    ...(firstMessage ? { firstMessage } : {}),
    ...(systemPrompt ? { systemPrompt } : {}),
    ...(agent?.language ? { language: agent.language } : {}),
    ...(initiation.conversation_config_override.tts ? { ttsVoiceId: initiation.conversation_config_override.tts.voice_id } : {}),
  });

  try {
    await persistElevenLabsConversation({
      businessId: input.businessId,
      callerPhone: input.targetPhone,
      agentId: input.config.elevenlabs?.agentId,
      conversationId: call.callId,
    });
  } catch (error) {
    // The call is already ringing; tools fall back to "unknown tenant" rather than the call failing.
    console.error("elevenlabs outbound: failed to persist conversation record", error);
  }
  return call;
}
