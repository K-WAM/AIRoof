// ElevenLabs webhook-tool route (T-111b): POST /api/webhooks/elevenlabs/tools/[tool]
//
// ElevenLabs calls this for each of the 7 tools (see
// src/lib/voice/elevenlabs/toolSchemas.ts). The request body is exactly the
// tool's request_body_schema object — parameters the LLM filled in from the
// conversation. NOTHING tenant- or caller-identifying is a model parameter:
//
// - businessId and the verified caller phone come ONLY from the stored
//   elevenlabsConversations record, keyed by the conversation id ElevenLabs
//   injects into the x-luxor-conversation-id header (the
//   {{system__conversation_id}} dynamic variable — configured in the tool
//   schema, never visible to the model).
// - Model-supplied businessId/callId/verifiedCallerPhone params are ignored
//   entirely (they are not even in the schemas; the dispatcher reads only
//   document fields).
//
// Auth is the same shared-secret header as the initiation webhook
// (ELEVENLABS_TOOL_SECRET, timing-safe, fail closed) and the same per-IP rate
// budget as the Vapi webhook. Responses are compact JSON the LLM can speak from.

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import { verifyElevenLabsToolSecret } from "@/lib/voice/elevenlabs/webhookAuth";
import {
  ELEVENLABS_CONVERSATION_ID_HEADER,
  isElevenLabsToolName,
} from "@/lib/voice/elevenlabs/toolSchemas";
import { getElevenLabsConversation } from "@/lib/voice/elevenlabs/conversationRecords";
import { executeAgentTool } from "@/lib/tools/toolDispatcher";

const UNVERIFIED_CALL_RESPONSE =
  "I couldn't verify this call — the office will call you back to help.";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
): Promise<NextResponse> {
  const { tool } = await params;

  const limited = checkRateLimit(request, { windowMs: 60_000, max: 300, keyPrefix: "elevenlabs-webhook" });
  if (limited) return limited;

  if (!verifyElevenLabsToolSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isElevenLabsToolName(tool)) {
    return NextResponse.json({ error: "Unknown tool" }, { status: 404 });
  }

  // The conversation id is system-provided (header dynamic variable), never a
  // model parameter.
  const conversationId = request.headers.get(ELEVENLABS_CONVERSATION_ID_HEADER);
  if (!conversationId) {
    console.error("elevenlabs tools: missing conversation id header", { tool });
    return NextResponse.json({ result: UNVERIFIED_CALL_RESPONSE });
  }

  const stored = await getElevenLabsConversation(conversationId);
  if (!stored) {
    console.error("elevenlabs tools: no stored conversation record", { tool, conversationId });
    return NextResponse.json({ result: UNVERIFIED_CALL_RESPONSE });
  }

  let toolParams: Record<string, unknown>;
  try {
    toolParams = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await executeAgentTool(tool, toolParams, {
      businessId: stored.businessId,
      callId: `call_elevenlabs_${conversationId}`,
      callerPhone: stored.callerPhone,
      provider: "elevenlabs",
      providerIds: { elevenLabsConversationId: conversationId },
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error(`elevenlabs tools: ${tool} failed`, error);
    return NextResponse.json({ error: "Tool execution failed" }, { status: 500 });
  }
}
