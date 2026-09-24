// ElevenLabs conversation-initiation webhook (T-111b) — inbound Twilio calls.
//
// ElevenLabs POSTs { caller_id, called_number, agent_id, call_sid, conversation_id? }
// during Twilio's dialing window and expects the conversation_initiation_client_data
// response FAST (this is on the call-answer critical path; ElevenLabs fetches it
// in parallel with the ringing). Field names re-verified 2026-09-24 against
// https://elevenlabs.io/docs/eleven-agents/customization/personalization/twilio-personalization.
//
// - Auth: shared-secret header (x-luxor-tool-secret) = ELEVENLABS_TOOL_SECRET,
//   timing-safe, fail closed (401, no detail).
// - Tenant: resolved server-side by called_number, then agent_id — never from the
//   model or the caller.
// - Response: dynamic_variables + conversation_config_override built from the
//   tenant's own config (same prompt/date/after-hours/recording-disclosure logic
//   as the Vapi assistant-request path) — see src/lib/voice/elevenlabs/initiationConfig.ts.
// - Persists elevenlabsConversations/{conversation_id-or-call_sid} so the tools
//   and post-call routes resolve the tenant + verified caller phone server-side.
// - Unknown tenant: 200 with a generic, tenant-agnostic response (the agent's
//   dashboard config answers) — a call must never be blocked or leaked.

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import { verifyElevenLabsToolSecret } from "@/lib/voice/elevenlabs/webhookAuth";
import {
  findBusinessByElevenLabsAgentId,
  findBusinessByElevenLabsPhoneNumber,
} from "@/lib/vapi/businessLookup";
import {
  buildInitiationResponse,
  genericInitiationResponse,
} from "@/lib/voice/elevenlabs/initiationConfig";
import { persistElevenLabsConversation } from "@/lib/voice/elevenlabs/conversationRecords";
import type { BusinessConfig } from "@/types";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const limited = checkRateLimit(request, { windowMs: 60_000, max: 300, keyPrefix: "elevenlabs-webhook" });
  if (limited) return limited;

  if (!verifyElevenLabsToolSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const record = asRecord(body);

  const callerId = readString(record.caller_id);
  const calledNumber = readString(record.called_number);
  const agentId = readString(record.agent_id);
  const callSid = readString(record.call_sid);
  const conversationId = readString(record.conversation_id);

  // Resolve the tenant by the called number first (the per-business discriminator
  // for a shared agent), then by agent id (dedicated-agent tenants).
  let businessId: string | null = null;
  try {
    if (calledNumber) {
      businessId = await findBusinessByElevenLabsPhoneNumber(calledNumber);
    }
    if (!businessId && agentId) {
      businessId = await findBusinessByElevenLabsAgentId(agentId);
    }
  } catch (error) {
    console.error("elevenlabs initiation: business lookup failed", error);
  }

  if (!businessId) {
    console.warn("elevenlabs initiation: unknown tenant", {
      hasCalledNumber: Boolean(calledNumber),
      hasAgentId: Boolean(agentId),
    });
    // Fail-safe: generic response, no tenant info, the call proceeds on the
    // agent's dashboard config.
    return NextResponse.json(genericInitiationResponse());
  }

  const config = await readBusinessConfig(businessId);

  // Record the conversation for the tools/post-call routes BEFORE responding —
  // the tools may be called seconds later. Best-effort: a write failure must
  // not block the call answer.
  if (conversationId || callSid) {
    try {
      await persistElevenLabsConversation({
        businessId,
        callerPhone: callerId,
        calledNumber,
        agentId,
        conversationId,
        callSid,
      });
    } catch (error) {
      console.error("elevenlabs initiation: failed to persist conversation record", error);
    }
  }

  if (!config) {
    console.error("elevenlabs initiation: business doc missing for resolved tenant", { businessId });
    return NextResponse.json(genericInitiationResponse());
  }

  return NextResponse.json(buildInitiationResponse(config, callerId, new Date()));
}

async function readBusinessConfig(businessId: string): Promise<BusinessConfig | null> {
  const db = getAdminFirestore();
  if (!db) return null;
  try {
    const snap = await db.collection("businesses").doc(businessId).get();
    return (snap.data() as BusinessConfig | undefined) ?? null;
  } catch (error) {
    console.error("elevenlabs initiation: config read failed", error);
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
