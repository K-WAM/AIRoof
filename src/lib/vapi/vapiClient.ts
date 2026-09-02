// Vapi REST API client — outbound call initiation only.
// Webhook-delivered events are handled in /api/webhooks/vapi.

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
 * one system prompt entry) actually changes.
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
  const current = (await getRes.json()) as { model?: { provider?: string; model?: string; toolIds?: string[] } };

  const patchRes = await fetch(`${VAPI_BASE_URL}/assistant/${input.assistantId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      firstMessage: input.firstMessage,
      model: {
        provider: current.model?.provider,
        model: current.model?.model,
        toolIds: current.model?.toolIds,
        messages: [{ role: "system", content: input.systemPrompt }],
      },
    }),
  });
  if (!patchRes.ok) {
    const text = await patchRes.text().catch(() => "");
    throw new Error(`Vapi PATCH /assistant failed (${patchRes.status}): ${text}`);
  }
}
