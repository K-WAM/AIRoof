import type { BusinessConfig } from "@/types";
import { initiateVapiCall, updateAssistantPersona } from "@/lib/vapi/vapiClient";
import { elevenLabsVoiceProvider } from "./elevenlabs/client";
import { voiceProviderOf, type VoiceProvider } from "./types";

const vapiVoiceProvider: VoiceProvider = {
  id: "vapi",
  isConfigured(config) {
    return Boolean(config.vapiAssistantId && config.vapiPhoneNumberId && process.env.VAPI_API_KEY);
  },
  async pushPersona(input) {
    if (!input.config.vapiAssistantId) throw new Error("Vapi assistant is not configured");
    await updateAssistantPersona({
      assistantId: input.config.vapiAssistantId,
      firstMessage: input.firstMessage,
      systemPrompt: input.systemPrompt,
      ...(input.language ? { transcriberLanguage: input.language } : {}),
      voiceConfig: input.config,
    });
  },
  async startOutboundCall(input) {
    const { vapiAssistantId, vapiPhoneNumberId } = input.config;
    if (!vapiAssistantId || !vapiPhoneNumberId) throw new Error("Vapi outbound calling is not configured");
    const call = await initiateVapiCall({
      assistantId: vapiAssistantId,
      phoneNumberId: vapiPhoneNumberId,
      customerNumber: input.targetPhone,
      ...(input.metadata ? { metadata: input.metadata } : {}),
      ...(input.variables || input.firstMessage ? { assistantOverrides: {
        ...(input.variables ? { variableValues: input.variables } : {}),
        ...(input.firstMessage ? { firstMessage: input.firstMessage } : {}),
      } } : {}),
      ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
    });
    return { callId: call.id };
  },
};

export function getVoiceProvider(config: Pick<BusinessConfig, "voiceProvider">): VoiceProvider {
  return voiceProviderOf(config) === "elevenlabs" ? elevenLabsVoiceProvider : vapiVoiceProvider;
}
