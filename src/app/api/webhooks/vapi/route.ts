// Single endpoint Vapi posts to for everything: function calls, transcripts,
// call lifecycle events. We switch on message.type.
//
// Configure in Vapi:
//   - Assistant → Server URL = https://ai-roof.vercel.app/api/webhooks/vapi
//   - Each Tool → leave Server URL blank (inherits from assistant)
//   - Header: x-vapi-secret = <VAPI_WEBHOOK_SECRET>
//
// T-111b: the tool execution and end-of-call writing were extracted verbatim
// into provider-independent modules so the ElevenLabs webhooks reuse them:
//   - src/lib/tools/toolDispatcher.ts  (executeAgentTool — the 7 tools)
//   - src/lib/calls/endOfCallWriter.ts (writeEndedCallReport + transcript
//     normalization). Behavior is unchanged.

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import { claimVapiWebhookEvent, recordVapiAuthFailure, verifyVapiWebhook } from "@/lib/vapi/verify";
import { findBusinessByVapiAssistantId, findBusinessByVapiPhoneNumberId } from "@/lib/vapi/businessLookup";
import { getBusinessTimezone } from "@/lib/tools/agentTools";
import { executeAgentTool } from "@/lib/tools/toolDispatcher";
import { buildAgentPrompt } from "@/lib/ai/agentPromptBuilder";
import { composeGreetingWithDisclosure, resolveRecordingDisclosure } from "@/lib/recordingDisclosure";
import { normalizeProviderTranscriptMessages, writeEndedCallReport } from "@/lib/calls/endOfCallWriter";
import type { BusinessConfig } from "@/types";
import type {
  VapiWebhookPayload,
  VapiFunctionCallMessage,
  VapiEndOfCallReportMessage,
  VapiStatusUpdateMessage,
  VapiCall,
  VapiToolResult,
} from "@/lib/vapi/types";

export async function POST(request: NextRequest) {
  // Generous on purpose: one real call can fire many webhook posts (tool
  // calls, status updates, the end-of-call report), and Vapi's own traffic
  // for potentially many businesses can share source IPs. This caps pure
  // flood/brute-force volume, not real concurrent-call bursts.
  const limited = checkRateLimit(request, { windowMs: 60_000, max: 300, keyPrefix: "vapi-webhook" });
  if (limited) return limited;

  if (!verifyVapiWebhook(request)) {
    // T-065: best-effort counter for the scheduled webhook-health check —
    // never blocks or fails this response either way.
    await recordVapiAuthFailure();
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: VapiWebhookPayload;
  try {
    payload = (await request.json()) as VapiWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = payload?.message;
  if (!message?.type) {
    return NextResponse.json({ error: "Missing message.type" }, { status: 400 });
  }

  const db = getAdminFirestore();
  if (!db) {
    console.error("Vapi webhook replay protection unavailable: Firestore is not configured");
    return NextResponse.json({ error: "Webhook unavailable" }, { status: 503 });
  }

  try {
    const replayClaim = await claimVapiWebhookEvent(db, message);
    if (replayClaim === "invalid") {
      return NextResponse.json({ error: "Missing Vapi event identity" }, { status: 400 });
    }
    if (replayClaim === "duplicate") {
      return NextResponse.json({ duplicate: true });
    }
  } catch (error) {
    console.error("Vapi webhook replay claim failed", error);
    return NextResponse.json({ error: "Webhook unavailable" }, { status: 503 });
  }

  const businessId = await resolveBusinessId(message.call);
  if (!businessId) {
    console.error("Vapi webhook: could not resolve business", {
      assistantId: message.call?.assistantId,
      phoneNumberId: message.call?.phoneNumberId,
      type: message.type,
    });
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  try {
    switch (message.type) {
      case "function-call":
      case "tool-calls":
        return NextResponse.json(
          await handleFunctionCall(message as VapiFunctionCallMessage, businessId)
        );

      case "status-update":
        await handleStatusUpdate(message as VapiStatusUpdateMessage, businessId);
        return NextResponse.json({ ok: true });

      case "end-of-call-report":
        await handleEndOfCallReport(message as VapiEndOfCallReportMessage, businessId);
        return NextResponse.json({ ok: true });

      case "assistant-request": {
        const tz = await getBusinessTimezone(businessId);
        const now = new Date();
        const dateStr = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: tz });
        const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
        const isAH = await checkAfterHours(db, businessId);
        const afterHoursNote = isAH
          ? "NOTE: It is currently after business hours, but you MUST still help the caller fully. You can and should book appointments for the next available business-hours slot — never turn a caller away. Tell them their appointment is booked and the team will confirm in the morning."
          : "Business is currently open.";

        // Build the full, industry-aware system prompt + greeting from THIS business's
        // own config so a single shared Vapi assistant can serve every vertical.
        // To activate: in the Vapi assistant, set the System Prompt to {{systemPrompt}}
        // and the First Message to {{greeting}}. Until then, the date variables below
        // keep the existing dashboard prompt working unchanged (backward compatible).
        let systemPrompt = "";
        let greeting = "";
        try {
          const snap = await db.collection("businesses").doc(businessId).get();
          const config = snap.data() as BusinessConfig | undefined;
          if (config) {
            const callerNumber = message.call?.customer?.number;
            systemPrompt = buildAgentPrompt(config, {
              runtime: { currentDate: dateStr, currentTime: timeStr, timezone: tz, afterHoursNote, callerPhone: callerNumber },
            });
            const baseGreeting = (isAH && config.afterHoursGreeting) ? config.afterHoursGreeting : (config.greeting ?? "");
            // T-102: the recording notice (default ON) is spoken first in the greeting.
            greeting = composeGreetingWithDisclosure(baseGreeting, resolveRecordingDisclosure(config));
          }
        } catch (err) {
          console.error("assistant-request: failed to build dynamic prompt", err);
        }

        return NextResponse.json({
          assistantOverrides: {
            variableValues: {
              currentDate: dateStr,
              currentTime: timeStr,
              currentTimezone: tz,
              afterHoursContext: afterHoursNote,
              systemPrompt,
              greeting,
            },
          },
        });
      }

      default:
        // transcript / speech-update / etc. — ack and ignore
        return NextResponse.json({ ok: true });
    }
  } catch (err) {
    console.error("Vapi webhook handler error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function resolveBusinessId(call?: VapiCall): Promise<string | null> {
  if (!call) return null;
  // Phone number first: it's the unique per-business discriminator when one shared
  // assistant serves many businesses. Falls back to assistantId for businesses that
  // still run a dedicated assistant (e.g. the current roofing demo).
  if (call.phoneNumberId) {
    const byPhone = await findBusinessByVapiPhoneNumberId(call.phoneNumberId);
    if (byPhone) return byPhone;
  }
  if (call.assistantId) {
    const byAssistant = await findBusinessByVapiAssistantId(call.assistantId);
    if (byAssistant) return byAssistant;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Function call handler — execute the tool, return Vapi-formatted result.
// Supports both Vapi's older "function-call" and newer "tool-calls" payloads.
// Tool execution itself is the provider-independent dispatcher in
// src/lib/tools/toolDispatcher.ts.
// ──────────────────────────────────────────────────────────────────────────────

async function handleFunctionCall(
  message: VapiFunctionCallMessage,
  businessId: string
): Promise<VapiToolResult | { results: Array<{ toolCallId: string; result?: string; error?: string }> }> {
  const callId = `call_vapi_${message.call.id}`;
  const callerPhone = message.call.customer?.number;

  // Newer Vapi payload: array of tool calls
  if (message.type === "tool-calls" && Array.isArray(message.toolCalls)) {
    const results = await Promise.all(
      message.toolCalls.map(async (tc) => {
        const params =
          typeof tc.function.arguments === "string"
            ? safeJsonParse(tc.function.arguments)
            : tc.function.arguments;
        const out = await executeAgentTool(
          tc.function.name,
          params ?? {},
          {
            businessId,
            callId,
            callerPhone,
            provider: "vapi",
            providerIds: { vapiCallId: message.call.id, vapiToolCallId: tc.id },
          }
        );
        return { toolCallId: tc.id, ...out };
      })
    );
    return { results };
  }

  // Older payload: single function call
  if (message.functionCall) {
    return executeAgentTool(
      message.functionCall.name,
      message.functionCall.parameters,
      {
        businessId,
        callId,
        callerPhone,
        provider: "vapi",
        providerIds: { vapiCallId: message.call.id },
      }
    );
  }

  return { error: "No function call in payload" };
}

// ──────────────────────────────────────────────────────────────────────────────
// Call lifecycle handlers
// ──────────────────────────────────────────────────────────────────────────────

async function handleStatusUpdate(
  message: VapiStatusUpdateMessage,
  businessId: string
): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;

  const callId = `call_vapi_${message.call.id}`;
  const callRef = db.collection("businesses").doc(businessId).collection("calls").doc(callId);

  if (message.status === "in-progress" || message.status === "ringing") {
    const isAfterHours = await checkAfterHours(db, businessId);
    await callRef.set(
      {
        callId,
        businessId,
        callerPhone: message.call.customer?.number ?? null,
        status: "active",
        startedAt: Date.now(),
        updatedAt: Date.now(),
        vapiCallId: message.call.id,
        messages: [],
        isAfterHours,
      },
      { merge: true }
    );
  } else if (message.status === "ended") {
    await callRef.set({ status: "ended", endedAt: Date.now(), updatedAt: Date.now() }, { merge: true });
  }
}

async function handleEndOfCallReport(
  message: VapiEndOfCallReportMessage,
  businessId: string
): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;

  const callId = `call_vapi_${message.call.id}`;
  // Shared writer (T-111b): transcript mapping + outcome classification + the
  // exact `calls` document the Vapi path has always written.
  await writeEndedCallReport(db, {
    businessId,
    callId,
    callerPhone: message.call.customer?.number ?? null,
    messages: normalizeProviderTranscriptMessages(message.messages ?? []),
    summary: message.summary ?? null,
    endedReason: message.endedReason ?? null,
    recordingUrl: message.recordingUrl ?? null,
    cost: message.cost ?? null,
    providerFields: { vapiCallId: message.call.id },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────────────────────────────────

// Check if a call is happening outside configured business hours.
async function checkAfterHours(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  businessId: string
): Promise<boolean> {
  try {
    const snap = await db.collection("businesses").doc(businessId).get();
    const data = snap.data();
    if (!data) return false;
    const hours: Record<string, string> = data.businessHours ?? {};
    const tz: string = data.timezone ?? "America/New_York";

    const now = new Date();
    const dayName = now.toLocaleDateString("en-US", { timeZone: tz, weekday: "long" });
    const todayHours = hours[dayName];
    if (!todayHours || todayHours.toLowerCase() === "closed") return true;

    // Parse "08:00 - 17:00"
    const m = todayHours.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
    if (!m) return false;
    const openH = parseInt(m[1]), openM = parseInt(m[2]);
    const closeH = parseInt(m[3]), closeM = parseInt(m[4]);

    const localTime = new Date(now.toLocaleString("en-US", { timeZone: tz }));
    const currentMins = localTime.getHours() * 60 + localTime.getMinutes();
    const openMins = openH * 60 + openM;
    const closeMins = closeH * 60 + closeM;
    return currentMins < openMins || currentMins >= closeMins;
  } catch {
    return false;
  }
}

function safeJsonParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
}
