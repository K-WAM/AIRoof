import OpenAI from "openai";
import { getCapabilityStatus, getEnv } from "@/lib/config/env";

export type AiOperation =
  | "parse-field-update"
  | "summarize"
  | "classify"
  | "faq-suggest"
  | "agent-respond"
  | "transcribe";

export type AiProvider = "openai" | "deepseek";

export interface ModelSelection {
  provider: AiProvider;
  model: string;
}

export interface ModelOverrides {
  backOfficeModel?: string;
  liveModel?: string;
}

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const deepseek = process.env.DEEPSEEK_API_KEY
  ? new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com",
    })
  : null;

export function getOpenAIClient(): OpenAI | null {
  return openai;
}

export function getDeepSeekClient(): OpenAI | null {
  return deepseek;
}

export function isProviderReady(provider: AiProvider): boolean {
  return getCapabilityStatus(provider) === "configured";
}

export function requireProvider(provider: AiProvider): OpenAI {
  if (provider === "openai") {
    if (!openai || !isProviderReady("openai")) {
      throw new Error("OpenAI provider is not configured");
    }
    return openai;
  }
  if (!deepseek || !isProviderReady("deepseek")) {
    throw new Error("DeepSeek provider is not configured");
  }
  return deepseek;
}

const modelDefaults: Record<AiOperation, { provider: AiProvider; model: string }> = {
  "parse-field-update": { provider: "openai", model: "gpt-4o" },
  "summarize": { provider: "deepseek", model: "deepseek-chat" },
  "classify": { provider: "deepseek", model: "deepseek-chat" },
  "faq-suggest": { provider: "deepseek", model: "deepseek-chat" },
  "agent-respond": { provider: "openai", model: "gpt-4o-mini" },
  "transcribe": { provider: "openai", model: "whisper-1" },
};

const deepseekModelEnv = getEnv("DEEPSEEK_MODEL");
const openaiModelEnv = getEnv("OPENAI_MODEL");

export function selectModel(
  operation: AiOperation,
  overrides?: ModelOverrides,
): ModelSelection {
  const def = modelDefaults[operation];

  if (def.provider === "deepseek") {
    if (overrides?.backOfficeModel && overrides.backOfficeModel.startsWith("gpt-")) {
      return { provider: "openai", model: overrides.backOfficeModel };
    }
    if (overrides?.backOfficeModel) {
      return { provider: "deepseek", model: overrides.backOfficeModel };
    }
    if (deepseekModelEnv) {
      return { provider: "deepseek", model: deepseekModelEnv };
    }
    return { ...def };
  }

  if (overrides?.liveModel && operation === "agent-respond") {
    return { provider: "openai", model: overrides.liveModel };
  }
  if (overrides?.liveModel && operation === "parse-field-update") {
    return { provider: "openai", model: overrides.liveModel };
  }
  if (openaiModelEnv) {
    return { provider: "openai", model: openaiModelEnv };
  }
  return { ...def };
}

export function selectClient(
  operation: AiOperation,
  overrides?: ModelOverrides,
): { client: OpenAI | null; selection: ModelSelection } {
  const selection = selectModel(operation, overrides);

  if (selection.provider === "deepseek") {
    return { client: deepseek, selection };
  }
  return { client: openai, selection };
}

const isProduction = (): boolean => process.env.NODE_ENV === "production";
const isDev = (): boolean => !isProduction();

export function canUseMock(): boolean {
  if (isProduction()) return false;
  return isDev();
}

export function mockLabel(operation: AiOperation): string {
  return `[MOCK-${operation}] `;
}
