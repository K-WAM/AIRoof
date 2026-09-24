// Vapi REST API client — outbound call initiation only.
// Webhook-delivered events are handled in /api/webhooks/vapi.

import type { BusinessConfig } from "@/types";
import { voiceForLanguage } from "./voices";

const VAPI_BASE_URL = process.env.VAPI_BASE_URL ?? "https://api.vapi.ai";

export interface InitiateVapiCallInput {
  assistantId: string;
  phoneNumberId: string;
  customerNumber: string;
  metadata?: Record<string, string>;
  assistantOverrides?: {
    variableValues?: Record<string, string>;
    firstMessage?: string;
  };
  /** ISO-8601 string; if set, Vapi schedules the call at this time */
  scheduledAt?: string;
}

export interface VapiCallCreated {
  id: string;
  status: string;
  createdAt?: string;
}

export async function initiateVapiCall(
  input: InitiateVapiCallInput
): Promise<VapiCallCreated> {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) throw new Error("VAPI_API_KEY is not set — cannot initiate outbound call");

  const body: Record<string, unknown> = {
    assistantId: input.assistantId,
    phoneNumberId: input.phoneNumberId,
    customer: { number: input.customerNumber },
  };

  if (input.metadata) body.metadata = input.metadata;
  if (input.assistantOverrides) body.assistantOverrides = input.assistantOverrides;
  if (input.scheduledAt) {
    body.schedulePlan = {
      earliestAt: input.scheduledAt,
      latestAt: new Date(new Date(input.scheduledAt).getTime() + 15 * 60 * 1000).toISOString(),
    };
  }

  const res = await fetch(`${VAPI_BASE_URL}/call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Vapi /call failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<VapiCallCreated>;
}

export interface UpdateAssistantPersonaInput {
  assistantId: string;
  /** Rendered greeting text — replaces the assistant's first message verbatim. */
  firstMessage: string;
  /** Rendered system prompt — replaces the assistant's single system message verbatim. */
  systemPrompt: string;
  /**
   * Phase 12/Phase 6 (Spanish) — overlays just the `language` sub-field onto whatever
   * transcriber this assistant already has configured (provider/model untouched), rather than
   * constructing a transcriber object from scratch. Deliberately conservative: this repo doesn't
   * hardcode Deepgram's exact model string anywhere, and this way it never has to. Pass "en"/"es"
   * for a single-language switch. "multi" (bilingual) is intentionally not offered here yet — see
   * this function's own file-level doc note on why.
   */
  transcriberLanguage?: "en" | "es";
  /** Optional per-language override; absent language leaves Vapi's live voice untouched. */
  voiceConfig?: Pick<BusinessConfig, "voice">;
}

/**
 * Push a rendered greeting + system prompt directly onto a Vapi assistant.
 *
 * Exists because Vapi's `assistant-request` dynamic-config webhook only fires when a
 * phone number has NO fixed assistantId — every number this platform provisions today
 * (including the shared demo line) has one, so `{{systemPrompt}}`/`{{greeting}}`
 * template placeholders on the assistant never get filled by a live call and render
 * empty. This is the actual mechanism that makes a persona change "take" on a real
 * call: call it right after any config change the live line's persona should reflect.
 *
 * Vapi's PATCH replaces the whole `model` object, so this reads the assistant first
 * and resends its existing provider/model/toolIds unchanged — only `messages` (the
 * one system prompt entry) actually changes. `startSpeakingPlan`/`stopSpeakingPlan`
 * are read back from the same GET and re-sent verbatim on every PATCH, unconditionally
 * — see CLAUDE.md's 2026-09-07 gpt-realtime incident: these are the hand-tuned
 * turn-taking settings that govern the cascaded transcriber→LLM→TTS pipeline, and a
 * nested object a PATCH doesn't explicitly carry forward is the exact kind of gap
 * that incident traced back to. Belt-and-suspenders, not just for the transcriber
 * change this function now also makes — every call through here preserves them.
 *
 * Voice is sent only for an explicitly configured language override. Otherwise
 * the live dashboard voice survives this PATCH unchanged.
 */
export async function updateAssistantPersona(input: UpdateAssistantPersonaInput): Promise<void> {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) throw new Error("VAPI_API_KEY is not set — cannot update assistant persona");

  const getRes = await fetch(`${VAPI_BASE_URL}/assistant/${input.assistantId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!getRes.ok) {
    const text = await getRes.text().catch(() => "");
    throw new Error(`Vapi GET /assistant failed (${getRes.status}): ${text}`);
  }
  const current = (await getRes.json()) as {
    model?: { provider?: string; model?: string; toolIds?: string[] };
    transcriber?: Record<string, unknown>;
    startSpeakingPlan?: unknown;
    stopSpeakingPlan?: unknown;
  };

  const patchBody: Record<string, unknown> = {
    firstMessage: input.firstMessage,
    model: {
      provider: current.model?.provider,
      model: current.model?.model,
      toolIds: current.model?.toolIds,
      messages: [{ role: "system", content: input.systemPrompt }],
    },
    ...(current.startSpeakingPlan !== undefined ? { startSpeakingPlan: current.startSpeakingPlan } : {}),
    ...(current.stopSpeakingPlan !== undefined ? { stopSpeakingPlan: current.stopSpeakingPlan } : {}),
  };
  if (input.transcriberLanguage) {
    patchBody.transcriber = { ...(current.transcriber ?? {}), language: input.transcriberLanguage };
  }
  const voice = input.voiceConfig && voiceForLanguage(input.voiceConfig, input.transcriberLanguage ?? "en");
  if (voice) patchBody.voice = voice;

  const patchRes = await fetch(`${VAPI_BASE_URL}/assistant/${input.assistantId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(patchBody),
  });
  if (!patchRes.ok) {
    const text = await patchRes.text().catch(() => "");
    throw new Error(`Vapi PATCH /assistant failed (${patchRes.status}): ${text}`);
  }
}
