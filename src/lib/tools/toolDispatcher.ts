// Provider-independent dispatcher for the 7 booking tools (T-111b).
//
// Extracted verbatim from src/app/api/webhooks/vapi/route.ts's executeTool as a
// pure refactor — the Vapi webhook now calls this module with
// `provider: "vapi"` and the ElevenLabs tools route calls it with
// `provider: "elevenlabs"`. Behavior is unchanged; the only new inputs are the
// audit actor id (so audit events say which provider executed the tool) and the
// caller-supplied params, which are NEVER authoritative for businessId /
// caller identity (the caller's number always comes from verified call
// metadata, and the businessId from the route's server-side resolution).

import { getAdminFirestore } from "@/lib/firebase/admin";
import { appendAuditEvent } from "@/lib/audit";
import type { AuditProviderIds, AuditResult } from "@/lib/audit";
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

export type ToolProvider = "vapi" | "elevenlabs";

export interface AgentToolResult {
  result?: string;
  error?: string;
}

export interface AgentToolContext {
  businessId: string;
  callId: string;
  callerPhone?: string;
  provider: ToolProvider;
  providerIds?: AuditProviderIds;
}

export async function executeAgentTool(
  name: string,
  params: Record<string, unknown>,
  context: AgentToolContext
): Promise<AgentToolResult> {
  const { businessId, callId, callerPhone, provider } = context;
  const providerIds = context.providerIds ?? {};
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
          await recordProviderToolAudit(
            businessId,
            callId,
            "appointment.lookup",
            provider,
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
        await recordProviderToolAudit(
          businessId,
          callId,
          "appointment.lookup",
          provider,
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
          await recordProviderToolAudit(
            businessId,
            callId,
            "appointment.cancel",
            provider,
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
        await recordProviderToolAudit(
          businessId,
          callId,
          "appointment.cancel",
          provider,
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
      await recordProviderToolAudit(
        businessId,
        callId,
        name === "lookupAppointment" ? "appointment.lookup" : "appointment.cancel",
        provider,
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
// helpers (moved verbatim from the Vapi route)
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

async function recordProviderToolAudit(
  businessId: string,
  callId: string,
  action: "appointment.lookup" | "appointment.cancel",
  provider: ToolProvider,
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
      actor: { type: "provider", id: provider },
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
