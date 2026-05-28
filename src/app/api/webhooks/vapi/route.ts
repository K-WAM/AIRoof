// Single endpoint Vapi posts to for everything: function calls, transcripts,
// call lifecycle events. We switch on message.type.
//
// Configure in Vapi:
//   - Assistant → Server URL = https://ai-roof.vercel.app/api/webhooks/vapi
//   - Each Tool → leave Server URL blank (inherits from assistant)
//   - Header: x-vapi-secret = <VAPI_WEBHOOK_SECRET>

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyVapiWebhook } from "@/lib/vapi/verify";
import { findBusinessByVapiAssistantId, findBusinessByVapiPhoneNumberId } from "@/lib/vapi/businessLookup";
import {
  bookAppointment,
  cancelAppointment,
  checkAvailability,
  createLead,
  escalateCall,
  lookupAppointment,
  getCurrentDate,
  logAgentAction,
  getBusinessTimezone,
} from "@/lib/tools/agentTools";
import type {
  VapiWebhookPayload,
  VapiMessage,
  VapiFunctionCallMessage,
  VapiEndOfCallReportMessage,
  VapiStatusUpdateMessage,
  VapiCall,
  VapiToolResult,
} from "@/lib/vapi/types";

export async function POST(request: NextRequest) {
  if (!verifyVapiWebhook(request)) {
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

      default:
        // transcript / speech-update / etc. — ack and ignore for now
        return NextResponse.json({ ok: true });
    }
  } catch (err) {
    console.error("Vapi webhook handler error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function resolveBusinessId(call?: VapiCall): Promise<string | null> {
  if (!call) return null;
  if (call.assistantId) {
    const byAssistant = await findBusinessByVapiAssistantId(call.assistantId);
    if (byAssistant) return byAssistant;
  }
  if (call.phoneNumberId) {
    const byPhone = await findBusinessByVapiPhoneNumberId(call.phoneNumberId);
    if (byPhone) return byPhone;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Function call handler — execute the tool, return Vapi-formatted result.
// Supports both Vapi's older "function-call" and newer "tool-calls" payloads.
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
        const out = await executeTool(tc.function.name, params ?? {}, businessId, callId, callerPhone);
        return { toolCallId: tc.id, ...out };
      })
    );
    return { results };
  }

  // Older payload: single function call
  if (message.functionCall) {
    return executeTool(
      message.functionCall.name,
      message.functionCall.parameters,
      businessId,
      callId,
      callerPhone
    );
  }

  return { error: "No function call in payload" };
}

async function executeTool(
  name: string,
  params: Record<string, unknown>,
  businessId: string,
  callId: string,
  callerPhone?: string
): Promise<VapiToolResult> {
  const tz = await getBusinessTimezone(businessId);
  try {
    switch (name) {
      case "bookAppointment": {
        const startTime = toTimestamp(params.startTime ?? params.preferredTime, tz);
        const endTime = toTimestamp(params.endTime, tz) ?? (startTime ? startTime + 60 * 60 * 1000 : Date.now() + 60 * 60 * 1000);
        const appt = await bookAppointment({
          businessId,
          callerName: String(params.name ?? params.callerName ?? "Unknown"),
          callerPhone: sanitizePhone(callerPhone) ?? sanitizePhone(String(params.phone ?? params.callerPhone ?? "")) ?? "",
          serviceType: optionalStr(params.serviceType ?? params.service),
          address: optionalStr(params.address),
          startTime: startTime ?? Date.now() + 24 * 60 * 60 * 1000,
          endTime,
          sourceCallId: callId,
        });
        await logAction(businessId, callId, "bookAppointment", params, appt, "success");
        return {
          result: `Appointment booked (ID: ${appt.appointmentId}) for ${appt.callerName} on ${new Date(appt.startTime).toLocaleString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}. Save this ID in case the caller asks to change it. The team will confirm shortly.`,
        };
      }

      case "createLead": {
        const lead = await createLead({
          businessId,
          callerName: optionalStr(params.name ?? params.callerName),
          callerPhone: sanitizePhone(callerPhone) ?? sanitizePhone(String(params.phone ?? params.callerPhone ?? "")) ?? undefined,
          serviceRequested: optionalStr(params.serviceRequested ?? params.service),
          address: optionalStr(params.address),
          urgency: parseUrgency(params.urgency),
          notes: optionalStr(params.notes),
          sourceCallId: callId,
        });
        await logAction(businessId, callId, "createLead", params, lead, "success");
        return { result: `Lead captured for ${lead.callerName ?? "caller"}. The team will follow up.` };
      }

      case "escalateCall": {
        const reason = String(params.reason ?? "Emergency reported by caller");
        const result = await escalateCall({
          businessId,
          callId,
          reason,
          callerPhone: callerPhone ?? optionalStr(params.callerPhone),
          summary: optionalStr(params.summary),
        });
        await logAction(businessId, callId, "escalateCall", params, result, "success");
        return { result: "Call flagged as urgent. The team has been notified and will call back within 15 minutes." };
      }

      case "checkAvailability": {
        const result = await checkAvailability({
          businessId,
          preferredDate: optionalStr(params.preferredDate),
          serviceType: optionalStr(params.serviceType ?? params.service),
        });
        if (!result.available || result.suggestedSlots.length === 0) {
          return { result: "No openings in the next few days. I can take a message and have someone reach out." };
        }
        const slots = result.suggestedSlots
          .slice(0, 3)
          .map((s) => new Date(s.startTime).toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))
          .join("; ");
        return { result: `Available slots: ${slots}` };
      }

      case "lookupAppointment": {
        const result = await lookupAppointment({
          businessId,
          callerPhone: optionalStr(params.callerPhone ?? params.phone) ?? callerPhone,
          callerName: optionalStr(params.callerName ?? params.name),
          address: optionalStr(params.address),
        });
        await logAction(businessId, callId, "checkAvailability", params, { result }, "success");
        return { result };
      }

      case "cancelAppointment": {
        const appointmentId = optionalStr(params.appointmentId ?? params.appointment_id);
        if (!appointmentId) return { error: "appointmentId is required to cancel an appointment" };
        await cancelAppointment({ businessId, appointmentId });
        await logAction(businessId, callId, "bookAppointment", params, { cancelled: true }, "success");
        return { result: `Appointment ${appointmentId} has been cancelled. You can now book a new one with the correct date.` };
      }

      case "getCurrentDate": {
        const dateInfo = await getCurrentDate({ businessId });
        return { result: `Today is ${dateInfo.today} (${dateInfo.dayOfWeek}). ISO: ${dateInfo.isoDate}. Use this when calculating relative dates like "next Wednesday" or "this Friday".` };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    console.error(`Tool ${name} failed:`, err);
    await logAction(businessId, callId, name, params, { error: String(err) }, "failed");
    return { error: err instanceof Error ? err.message : "Tool execution failed" };
  }
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
  const callRef = db.collection("businesses").doc(businessId).collection("calls").doc(callId);

  // Convert Vapi message log to our CallMessage format
  const transcript = (message.messages ?? []).map((m, i) => ({
    messageId: `m_${i}`,
    // Vapi sends "bot" (not "assistant") for Alice's turns in end-of-call-report
    role: m.role === "user" ? "caller" : (m.role === "assistant" || m.role === "bot") ? "agent" : "system",
    text: m.message ?? m.content ?? "",
    timestamp: m.time ?? Date.now(),
  }));

  await callRef.set(
    {
      callId,
      businessId,
      callerPhone: message.call.customer?.number ?? null,
      status: "ended",
      endedAt: Date.now(),
      updatedAt: Date.now(),
      vapiCallId: message.call.id,
      summary: message.summary ?? null,
      endedReason: message.endedReason ?? null,
      recordingUrl: message.recordingUrl ?? null,
      cost: message.cost ?? null,
      messages: transcript,
    },
    { merge: true }
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────────────────────────────────

// Returns a phone string only if it contains enough digits to be real (≥7 digits).
// Rejects LLM artifacts like "caller ID", "caller", "unknown".
function sanitizePhone(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  if (trimmed.length === 0) return undefined;
  const digitCount = (trimmed.match(/\d/g) ?? []).length;
  return digitCount >= 7 ? trimmed : undefined;
}

function optionalStr(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function safeJsonParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getTZUTCOffsetHours(date: Date, tz: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" });
  const tzPart = fmt.formatToParts(date).find(p => p.type === "timeZoneName")?.value ?? "GMT-5";
  const m = tzPart.match(/GMT([+-])(\d+)/);
  return m ? (m[1] === "+" ? 1 : -1) * parseInt(m[2]) : -5;
}

function toTimestamp(v: unknown, tz = "America/New_York"): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    // Bare ISO string (no timezone) — treat as business local time, not UTC, since Vercel runs in UTC
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) && !v.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(v)) {
      const offset = getTZUTCOffsetHours(new Date(), tz);
      const sign = offset >= 0 ? "+" : "-";
      const offsetStr = `${sign}${String(Math.abs(offset)).padStart(2, "0")}:00`;
      const t = Date.parse(v + offsetStr);
      return Number.isNaN(t) ? undefined : t;
    }
    const t = Date.parse(v);
    return Number.isNaN(t) ? undefined : t;
  }
  return undefined;
}

function parseUrgency(v: unknown): "low" | "normal" | "urgent" | "unknown" {
  if (v === "low" || v === "normal" || v === "urgent" || v === "unknown") return v;
  return "unknown";
}

async function logAction(
  businessId: string,
  callId: string,
  type: string,
  input: unknown,
  output: unknown,
  status: "pending" | "success" | "failed"
): Promise<void> {
  const validTypes = [
    "checkAvailability",
    "bookAppointment",
    "createLead",
    "sendOwnerNotification",
    "sendCustomerConfirmation",
    "escalateCall",
    "endCall",
    "initiateOutboundCall",
  ] as const;
  type ActionType = (typeof validTypes)[number];
  if (!(validTypes as readonly string[]).includes(type)) return;

  await logAgentAction({
    actionId: `act_${Date.now()}`,
    businessId,
    callId,
    type: type as ActionType,
    input,
    output,
    status,
    createdAt: Date.now(),
  });
}
