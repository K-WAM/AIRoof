import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessConfig } from "@/types";
import { UnsupportedVoiceFeatureError } from "../../types";
import { pushPersona, startOutboundCall } from "../client";

const config = { elevenlabs: { agentId: "agent_123", phoneNumberId: "phone_123", phoneNumber: "+15551234567" }, agentLanguage: "es" } as BusinessConfig;
beforeEach(() => vi.stubEnv("ELEVENLABS_API_KEY", "test-key"));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("ElevenLabs client", () => {
  it("PATCHes prompt, greeting and explicit language without touching dashboard voice", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetch);
    await pushPersona({ config, firstMessage: "Hola", systemPrompt: "Prompt", language: "es" });
    expect(fetch).toHaveBeenCalledWith("https://api.elevenlabs.io/v1/convai/agents/agent_123", {
      method: "PATCH", headers: { "Content-Type": "application/json", "xi-api-key": "test-key" },
      body: JSON.stringify({ conversation_config: { agent: { prompt: { prompt: "Prompt" }, first_message: "Hola", language: "es" } } }),
    });
  });

  it("uses only an explicit ElevenLabs voice override for the selected language", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetch);
    await pushPersona({ config: { ...config, voice: { es: { provider: "11labs", voiceId: "warm_voice", model: "eleven_turbo_v2" } } }, firstMessage: "Hola", systemPrompt: "Prompt" });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ conversation_config: { agent: { prompt: { prompt: "Prompt" }, first_message: "Hola" }, tts: { voice_id: "warm_voice", model_id: "eleven_turbo_v2" } } });
  });

  it("POSTs exact outbound payload with dynamic variables and first-message override", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, conversation_id: "conv_123" }) }); vi.stubGlobal("fetch", fetch);
    const call = await startOutboundCall({ config, targetPhone: "+15557654321", metadata: { businessId: "biz" }, variables: { callType: "outbound" }, firstMessage: "Hello" });
    expect(call).toEqual({ callId: "conv_123" });
    expect(fetch).toHaveBeenCalledWith("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
      method: "POST", headers: { "Content-Type": "application/json", "xi-api-key": "test-key" },
      body: JSON.stringify({ agent_id: "agent_123", agent_phone_number_id: "phone_123", to_number: "+15557654321", conversation_initiation_client_data: { dynamic_variables: { businessId: "biz", callType: "outbound" }, conversation_config_override: { agent: { first_message: "Hello" } } } }),
    });
  });

  it("rejects scheduled calls before fetch and never exposes provider response bodies", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "secret-body" }); vi.stubGlobal("fetch", fetch);
    await expect(startOutboundCall({ config, targetPhone: "+15557654321", scheduledAt: "2026-10-01T18:00:00Z" })).rejects.toBeInstanceOf(UnsupportedVoiceFeatureError);
    expect(fetch).not.toHaveBeenCalled();
    await expect(pushPersona({ config, firstMessage: "Hi", systemPrompt: "Prompt" })).rejects.not.toThrow("secret-body");
  });
});
