// One-time / on-demand "push every tenant's current greeting + prompt to its live Vapi assistant".
//
// Why this exists: every provisioned number has a fixed assistantId, so the dynamic
// `assistant-request` path never fires — a persona change only reaches a live line when
// `updateAssistantPersona` pushes it. Config-only changes that apply to every tenant by default
// (the T-102 recording notice is "missing field = ON") therefore need one explicit sync to take
// effect on lines that nobody has re-saved since.
//
// This module is the pure planner (unit-tested). The route (`/api/admin/sync-personas`) does the I/O.

import { buildAgentPrompt } from "@/lib/ai/agentPromptBuilder";
import { composeGreetingWithDisclosure, resolveRecordingDisclosure } from "@/lib/recordingDisclosure";
import type { BusinessConfig } from "@/types";

export interface PersonaSyncTarget {
  businessId: string;
  businessName: string;
  assistantId: string;
  firstMessage: string;
  systemPrompt: string;
  /** Only present when the tenant has an explicit language — an unset one leaves the transcriber alone. */
  transcriberLanguage?: "en" | "es";
  voiceConfig: Pick<BusinessConfig, "voice" | "agentLanguage">;
  disclosureEnabled: boolean;
}

export interface PersonaSyncSkip {
  businessId: string;
  businessName: string;
  reason: string;
}

export interface PersonaSyncPlan {
  targets: PersonaSyncTarget[];
  skipped: PersonaSyncSkip[];
}

export function planPersonaSync(businesses: Array<{ businessId: string; config: BusinessConfig }>): PersonaSyncPlan {
  const skipped: PersonaSyncSkip[] = [];
  const byAssistant = new Map<string, Array<{ businessId: string; config: BusinessConfig }>>();

  for (const biz of businesses) {
    const name = biz.config.businessName ?? biz.businessId;
    const assistantId = biz.config.vapiAssistantId?.trim();
    if (!assistantId) {
      skipped.push({ businessId: biz.businessId, businessName: name, reason: "No Vapi assistant attached" });
      continue;
    }
    // A greeting-less tenant would have the assistant say ONLY the recording notice — never push that.
    if (!biz.config.greeting?.trim()) {
      skipped.push({ businessId: biz.businessId, businessName: name, reason: "No greeting configured" });
      continue;
    }
    const group = byAssistant.get(assistantId) ?? [];
    group.push(biz);
    byAssistant.set(assistantId, group);
  }

  const targets: PersonaSyncTarget[] = [];
  for (const [assistantId, group] of byAssistant) {
    if (group.length > 1) {
      // One assistant serving several tenants (e.g. the shared demo line): pushing each would let the
      // last one win. Leave it to that assistant's own owner flow (Demo Studio launch / Settings save).
      for (const biz of group) {
        skipped.push({
          businessId: biz.businessId,
          businessName: biz.config.businessName ?? biz.businessId,
          reason: `Assistant ${assistantId} is shared by ${group.length} tenants — sync it from Demo Studio or that tenant's Settings`,
        });
      }
      continue;
    }
    const { businessId, config } = group[0];
    const disclosure = resolveRecordingDisclosure(config);
    // A malformed tenant config must skip that tenant, never abort the whole sync.
    let systemPrompt: string;
    try {
      systemPrompt = buildAgentPrompt(config);
    } catch (err) {
      skipped.push({
        businessId,
        businessName: config.businessName ?? businessId,
        reason: `Prompt could not be built (${err instanceof Error ? err.message : "invalid config"})`,
      });
      continue;
    }
    targets.push({
      businessId,
      businessName: config.businessName ?? businessId,
      assistantId,
      firstMessage: composeGreetingWithDisclosure(config.greeting ?? "", disclosure),
      systemPrompt,
      ...(config.agentLanguage ? { transcriberLanguage: config.agentLanguage } : {}),
      voiceConfig: { voice: config.voice, agentLanguage: config.agentLanguage },
      disclosureEnabled: disclosure.enabled,
    });
  }
  return { targets, skipped };
}
