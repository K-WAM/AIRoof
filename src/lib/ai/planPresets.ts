import type { BusinessConfig } from "@/types";

export type PlanTier = NonNullable<BusinessConfig["planTier"]>;

export interface PlanPreset {
  planTier: PlanTier;
  label: string;
  description: string;
  liveModel: string;
  backOfficeModel: string;
  agentVoice: string;
  agentTone: string;
  temperature: number;
  maxTokens: number;
}

export const PLAN_PRESETS: Record<PlanTier, PlanPreset> = {
  standard: {
    planTier: "standard",
    label: "Standard",
    description: "Core answering, qualification, lead capture, and emergency escalation.",
    liveModel: "gpt-4o-mini",
    backOfficeModel: "deepseek-chat",
    agentVoice: "alice",
    agentTone: "calm, concise, service-focused",
    temperature: 0.5,
    maxTokens: 150,
  },
  subscriber: {
    planTier: "subscriber",
    label: "Subscriber",
    description: "Paid upgrade with stronger live handling, better summaries, and richer tuning.",
    liveModel: "gpt-4.1",
    backOfficeModel: "gpt-4.1-mini",
    agentVoice: "verse",
    agentTone: "polished, confident, and highly attentive",
    temperature: 0.4,
    maxTokens: 220,
  },
};

export function getPlanPreset(planTier: BusinessConfig["planTier"]): PlanPreset {
  return PLAN_PRESETS[planTier || "standard"];
}
