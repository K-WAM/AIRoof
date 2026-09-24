import { voiceForLanguage } from "@/lib/vapi/voices";
import {
  UnsupportedVoiceFeatureError,
  type OutboundCallInput,
  type OutboundCallResult,
  type PersonaPushInput,
  type VoiceProvider,
} from "../types";

const BASE_URL = "https://api.elevenlabs.io/v1/convai";

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  return key;
}

async function request(path: string, method: "PATCH" | "POST", body: unknown): Promise<Response> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${method} ${path.split("/").slice(0, -1).join("/")} failed (${res.status})`);
  return res;
}

export async function pushPersona(input: PersonaPushInput): Promise<void> {
  const agentId = input.config.elevenlabs?.agentId;
  if (!agentId) throw new Error("ElevenLabs agent is not configured");
  const language = input.language ?? input.config.agentLanguage ?? "en";
  const voice = voiceForLanguage(input.config, language);
  const agent: Record<string, unknown> = {
    prompt: { prompt: input.systemPrompt },
    first_message: input.firstMessage,
    ...(input.language ? { language: input.language } : {}),
  };
  const conversationConfig: Record<string, unknown> = { agent };
  if (voice?.provider === "11labs") {
    conversationConfig.tts = {
      voice_id: voice.voiceId,
      ...(voice.model ? { model_id: voice.model } : {}),
    };
  }
  await request(`/agents/${encodeURIComponent(agentId)}`, "PATCH", { conversation_config: conversationConfig });
}

export async function startOutboundCall(input: OutboundCallInput): Promise<OutboundCallResult> {
  if (input.scheduledAt) throw new UnsupportedVoiceFeatureError("scheduled outbound calls", "elevenlabs");
  const { agentId, phoneNumberId } = input.config.elevenlabs ?? {};
  if (!agentId || !phoneNumberId) throw new Error("ElevenLabs outbound calling is not configured");
  const data: Record<string, unknown> = {};
  data.dynamic_variables = { ...input.metadata, ...input.variables };
  if (input.firstMessage) data.conversation_config_override = { agent: { first_message: input.firstMessage } };
  const res = await request("/twilio/outbound-call", "POST", {
    agent_id: agentId,
    agent_phone_number_id: phoneNumberId,
    to_number: input.targetPhone,
    conversation_initiation_client_data: data,
  });
  const result = await res.json() as { success?: boolean; conversation_id?: string; callSid?: string };
  const callId = result.conversation_id ?? result.callSid;
  if (result.success === false || !callId) throw new Error("ElevenLabs outbound call returned no call ID");
  return { callId };
}

export const elevenLabsVoiceProvider: VoiceProvider = {
  id: "elevenlabs",
  isConfigured(config) {
    return Boolean(config.elevenlabs?.agentId && config.elevenlabs?.phoneNumberId && process.env.ELEVENLABS_API_KEY);
  },
  pushPersona,
  startOutboundCall,
};
