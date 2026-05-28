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
