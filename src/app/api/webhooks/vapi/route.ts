// Single endpoint Vapi posts to for everything: function calls, transcripts,
// call lifecycle events. We switch on message.type.
//
// Configure in Vapi:
//   - Assistant → Server URL = https://ai-roof.vercel.app/api/webhooks/vapi
//   - Each Tool → leave Server URL blank (inherits from assistant)
//   - Header: x-vapi-secret = <VAPI_WEBHOOK_SECRET>

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { claimVapiWebhookEvent, verifyVapiWebhook } from "@/lib/vapi/verify";
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
import { classifyCallOutcome } from "@/lib/ai/deepseekClient";
import { buildAgentPrompt } from "@/lib/ai/agentPromptBuilder";
import { appendAuditEvent } from "@/lib/audit";
import type { AuditProviderIds, AuditResult } from "@/lib/audit";
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
            greeting = (isAH && config.afterHoursGreeting) ? config.afterHoursGreeting : (config.greeting ?? "");
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
        const out = await executeTool(
          tc.function.name,
          params ?? {},
          businessId,
          callId,
          callerPhone,
          { vapiCallId: message.call.id, vapiToolCallId: tc.id }
        );
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
      callerPhone,
      { vapiCallId: message.call.id }
    );
  }

  return { error: "No function call in payload" };
}

async function executeTool(
  name: string,
  params: Record<string, unknown>,
  businessId: string,
  callId: string,
  callerPhone?: string,
  providerIds: AuditProviderIds = {}
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
          callerEmail: optionalStr(params.email ?? params.callerEmail ?? params.customerEmail),
          serviceType: optionalStr(params.serviceType ?? params.service),
          address: optionalStr(params.address),
          notes: optionalStr(params.notes ?? params.summary ?? params.context),
          startTime: startTime ?? Date.now() + 24 * 60 * 60 * 1000,
          endTime,
          sourceCallId: callId,
        });
        await logAction(businessId, callId, "bookAppointment", params, appt, "success");
        const whenStr = new Date(appt.startTime).toLocaleString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
        return {
          result: appt.pendingConfirmation
            ? `Appointment booked (ID: ${appt.appointmentId}) for ${appt.callerName} on ${whenStr}. Since we're currently after hours, let the caller know it's reserved and a team member will confirm it first thing in the morning. Save this ID in case they ask to change it.`
            : `Appointment booked (ID: ${appt.appointmentId}) for ${appt.callerName} on ${whenStr}. Save this ID in case the caller asks to change it. The team will confirm shortly.`,
        };
      }

      case "createLead": {
        const lead = await createLead({
          businessId,
          callerName: optionalStr(params.name ?? params.callerName),
          callerPhone: sanitizePhone(callerPhone) ?? sanitizePhone(String(params.phone ?? params.callerPhone ?? "")) ?? undefined,
          callerEmail: optionalStr(params.email ?? params.callerEmail ?? params.customerEmail),
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
        const actionStatus =
          result.status === "delivered"
            ? "success"
            : result.status === "accepted"
              ? "pending"
              : "failed";
        await logAction(
          businessId,
          callId,
          "escalateCall",
          { reason },
          result,
          actionStatus
        );
        if (result.status === "delivered") {
          return {
            result:
              "I've flagged this as urgent, and the team was notified by email. I can't promise a response time. If anyone is in immediate danger, call emergency services now.",
          };
        }
        if (result.status === "accepted") {
          return {
            result:
              "I've flagged this as urgent for the team, but I can't confirm notification delivery yet. I can't promise a response time. If anyone is in immediate danger, call emergency services now.",
          };
        }
        return {
          result:
            "I've flagged this as urgent, but I couldn't confirm the team was notified. I can't promise a response time. If anyone is in immediate danger, call emergency services now.",
        };
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
        const verifiedCallerPhone = sanitizePhone(callerPhone);
        if (!verifiedCallerPhone) {
          const lead = await createLead({
            businessId,
            callerName: optionalStr(params.callerName ?? params.name),
            serviceRequested: optionalStr(params.serviceType ?? params.service),
            address: optionalStr(params.address),
            urgency: "normal",
            notes: "Appointment help requested, but caller ID was unavailable for identity verification.",
            sourceCallId: callId,
          });
          await logAction(businessId, callId, "createLead", params, lead, "success");
          await recordVapiToolAudit(
            businessId,
            callId,
            "appointment.lookup",
            providerIds,
            "denied",
            "caller_unverified"
          );
          return { result: "I can't verify you from caller ID — the office will call back." };
        }
        const result = await lookupAppointment({
          businessId,
          callId,
          verifiedCallerPhone,
        });
        const lookupFailed =
          result.startsWith("Unable") || result.startsWith("Error");
        await recordVapiToolAudit(
          businessId,
          callId,
          "appointment.lookup",
          providerIds,
          lookupFailed ? "failed" : "success",
          lookupFailed
            ? "provider_error"
            : result.startsWith("No active appointment")
              ? "no_match"
              : "completed"
        );
        return { result };
      }

      case "cancelAppointment": {
        const verifiedCallerPhone = sanitizePhone(callerPhone);
        if (!verifiedCallerPhone) {
          const lead = await createLead({
            businessId,
            callerName: optionalStr(params.callerName ?? params.name),
            serviceRequested: optionalStr(params.serviceType ?? params.service),
            address: optionalStr(params.address),
            urgency: "normal",
            notes: "Appointment cancellation requested, but caller ID was unavailable for identity verification.",
            sourceCallId: callId,
          });
          await logAction(businessId, callId, "createLead", params, lead, "success");
          await recordVapiToolAudit(
            businessId,
            callId,
            "appointment.cancel",
            providerIds,
            "denied",
            "caller_unverified"
          );
          return { result: "I can't verify you from caller ID — the office will call back." };
        }
        const appointmentId = optionalStr(params.appointmentId ?? params.appointment_id);
        const appointmentNumberRaw = params.appointmentNumber ?? params.appointment_number;
        const appointmentNumber =
          typeof appointmentNumberRaw === "number" &&
          Number.isInteger(appointmentNumberRaw) &&
          appointmentNumberRaw >= 1
            ? appointmentNumberRaw
            : undefined;
        const cancellation = await cancelAppointment({
          businessId,
          callId,
          verifiedCallerPhone,
          confirmCancellation:
            params.confirmCancellation === true || params.confirm === true,
          appointmentNumber,
          appointmentId,
        });
        await recordVapiToolAudit(
          businessId,
          callId,
          "appointment.cancel",
          providerIds,
          "success",
          "cancelled"
        );
        const appointmentTime = new Date(cancellation.startTime).toLocaleString("en-US", {
          timeZone: tz,
          weekday: "long",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        return {
          result: `Your ${cancellation.serviceType} appointment on ${appointmentTime} has been cancelled.`,
        };
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
    if (name === "lookupAppointment" || name === "cancelAppointment") {
      await recordVapiToolAudit(
        businessId,
        callId,
        name === "lookupAppointment" ? "appointment.lookup" : "appointment.cancel",
        providerIds,
        "failed",
        "tool_error"
      );
    }
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
  const callRef = db.collection("businesses").doc(businessId).collection("calls").doc(callId);

  // Convert Vapi message log to our CallMessage format
  const transcript = (message.messages ?? []).map((m, i) => ({
    messageId: `m_${i}`,
    // Vapi sends "bot" (not "assistant") for Alice's turns in end-of-call-report
    role: m.role === "user" ? "caller" : (m.role === "assistant" || m.role === "bot") ? "agent" : "system",
    text: m.message ?? m.content ?? "",
    timestamp: m.time ?? Date.now(),
  }));

  // Classify outcome async — don't block the webhook response
  let outcome: string | null = null;
  let outcomeReason: string | null = null;
  if (transcript.length > 1) {
    try {
      const bizSnap = await db.collection("businesses").doc(businessId).get();
      const businessName = bizSnap.data()?.businessName ?? businessId;
      const classification = await classifyCallOutcome({
        transcript: transcript.map((m) => ({ role: m.role, text: m.text })),
        businessName,
      });
      outcome = classification.outcome;
      outcomeReason = classification.reason;
    } catch {
      // non-fatal — proceed without outcome
    }
  }

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
      ...(outcome ? { outcome, outcomeReason } : {}),
    },
    { merge: true }
  );
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

async function recordVapiToolAudit(
  businessId: string,
  callId: string,
  action: "appointment.lookup" | "appointment.cancel",
  providerIds: AuditProviderIds,
  result: AuditResult,
  outcomeCode: string
): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;
  try {
    await appendAuditEvent(db, {
      businessId,
      correlationId: callId,
      action,
      actor: { type: "provider", id: "vapi" },
      subject: { type: "call", id: callId },
      providerIds,
      result,
      details: { outcomeCode },
    });
  } catch (error) {
    console.error(`Failed to append ${action} audit event:`, error);
  }
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
