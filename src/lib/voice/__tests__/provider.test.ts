import { afterEach, describe, expect, it, vi } from "vitest";
import type { BusinessConfig } from "@/types";

const mocks = vi.hoisted(() => ({ updateAssistantPersona: vi.fn(), initiateVapiCall: vi.fn() }));
vi.mock("@/lib/vapi/vapiClient", () => ({ updateAssistantPersona: mocks.updateAssistantPersona, initiateVapiCall: mocks.initiateVapiCall }));
import { getVoiceProvider } from "../provider";

const config = { vapiAssistantId: "assistant", vapiPhoneNumberId: "phone", agentLanguage: "es" } as BusinessConfig;
afterEach(() => { vi.unstubAllEnvs(); mocks.updateAssistantPersona.mockReset(); mocks.initiateVapiCall.mockReset(); });

describe("voice provider selection and Vapi passthrough", () => {
  it.each([undefined, "vapi", "garbage", null, 42])("uses Vapi for missing or unknown provider %s", (voiceProvider) => {
    expect(getVoiceProvider({ voiceProvider } as BusinessConfig).id).toBe("vapi");
  });

  it("passes existing persona arguments through unchanged", async () => {
    await getVoiceProvider(config).pushPersona({ config, firstMessage: "Hello", systemPrompt: "Prompt" });
    expect(mocks.updateAssistantPersona).toHaveBeenCalledWith({ assistantId: "assistant", firstMessage: "Hello", systemPrompt: "Prompt", voiceConfig: config });
    await getVoiceProvider(config).pushPersona({ config, firstMessage: "Hola", systemPrompt: "Prompt", language: "es" });
    expect(mocks.updateAssistantPersona).toHaveBeenLastCalledWith({ assistantId: "assistant", firstMessage: "Hola", systemPrompt: "Prompt", transcriberLanguage: "es", voiceConfig: config });
  });

  it("keeps Vapi metadata, variable values, first message, and schedule separate", async () => {
    mocks.initiateVapiCall.mockResolvedValue({ id: "call-id" });
    const result = await getVoiceProvider(config).startOutboundCall({ config, targetPhone: "+15551234567", metadata: { businessId: "biz" }, variables: { callType: "outbound" }, firstMessage: "Hello", scheduledAt: "2026-10-01T18:00:00.000Z" });
    expect(result).toEqual({ callId: "call-id" });
    expect(mocks.initiateVapiCall).toHaveBeenCalledWith({ assistantId: "assistant", phoneNumberId: "phone", customerNumber: "+15551234567", metadata: { businessId: "biz" }, assistantOverrides: { variableValues: { callType: "outbound" }, firstMessage: "Hello" }, scheduledAt: "2026-10-01T18:00:00.000Z" });
  });
});
