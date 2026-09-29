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
  addBookingNote,
  bookAppointment,
  cancelAppointment,
  checkAvailability,
  createLead,
  escalateCall,
  lookupAppointment,
  getCurrentDate,
  logAgentAction,
  getBusinessTimezone,
  zonedDateTimeToUtc,
} from "@/lib/tools/agentTools";
import { cleanCallerName } from "@/lib/format/name";
import { contactPhone, fmtPhone, samePhone } from "@/lib/format/phone";
import { nextOpeningLabel } from "@/lib/scheduling/hours";
import { isSmsEnabled, sendSms } from "@/lib/comms/sms";
import { resolveSmsSender } from "@/lib/phoneLines/sender";
import { bookingReceived } from "@/lib/comms/smsTemplates";
import { isEscalationEnabled } from "@/lib/ai/escalation";
import { runAfterResponse } from "@/lib/http/afterResponse";

export type ToolProvider = "vapi" | "elevenlabs";

export interface AgentToolResult {
  result?: string;
  sayToCaller?: string;
  error?: string;
}

export interface AgentToolContext {
  businessId: string;
  callId: string;
  callerPhone?: string;
  /** T-169: the line the caller dialed, from the authenticated call record (ElevenLabs). Never from tool parameters. */
  calledNumber?: string;
  provider: ToolProvider;
  providerIds?: AuditProviderIds;
}

export async function executeAgentTool(
  name: string,
  params: Record<string, unknown>,
  context: AgentToolContext
): Promise<AgentToolResult> {
  const { businessId, callId, callerPhone, calledNumber, provider } = context;
  const providerIds = context.providerIds ?? {};
  // Vapi retains its existing parameter fallback. ElevenLabs must use only
  // caller identity recorded by the authenticated initiation webhook.
  const trustedCallerPhone = provider === "elevenlabs"
    ? sanitizePhone(callerPhone)
    : sanitizePhone(callerPhone) ?? sanitizePhone(String(params.phone ?? params.callerPhone ?? ""));
  // A number the caller SAID to reach them on, kept beside caller ID (never replacing it — lookups and cancels match
  // caller ID). 2026-09-28: Carla said "305-389-4611", the booking kept the caller ID, and Call Back rang a line
  // that went to a carrier recording. The notes line makes it visible on every screen that shows notes.
  const spokenPhone = sanitizePhone(String(params.callbackPhone ?? params.phone ?? ""));
  const callbackPhone = spokenPhone && !samePhone(spokenPhone, trustedCallerPhone) ? spokenPhone : undefined;
  const withCallbackLine = (notes?: string) =>
    callbackPhone ? [notes, `Callback number: ${fmtPhone(callbackPhone)}`].filter(Boolean).join("\n") : notes;
  try {
    switch (name) {
      case "bookAppointment": {
        const rawStart = params.startTime ?? params.preferredTime;
        const rawEnd = params.endTime;
        // Numeric timestamps need no preliminary business-doc read. If the model
        // supplies a local date string, timezone resolution remains necessary.
        const inputTimezone = typeof rawStart === "string" || typeof rawEnd === "string"
          ? await getBusinessTimezone(businessId)
          : "America/New_York";
        const startTime = toTimestamp(rawStart, inputTimezone);
        const endTime = toTimestamp(rawEnd, inputTimezone) ?? (startTime ? startTime + 60 * 60 * 1000 : Date.now() + 60 * 60 * 1000);
        const appt = await bookAppointment({
          businessId,
          // "Es Carla Esnaida" (Spanish "it's") was saved as the name and the confirmation call said "Hi Es".
          callerName: cleanCallerName(String(params.name ?? params.callerName ?? "Unknown")),
          callerPhone: trustedCallerPhone ?? "",
          callbackPhone,
          callerEmail: normalizeSpokenEmail(params.email ?? params.callerEmail ?? params.customerEmail),
          serviceType: optionalStr(params.serviceType ?? params.service),
          address: optionalStr(params.address),
          notes: withCallbackLine(optionalStr(params.notes ?? params.summary ?? params.context)),
          startTime: startTime ?? Date.now() + 24 * 60 * 60 * 1000,
          endTime,
          sourceCallId: callId,
          textOk: parseYesNo(params.textOk ?? params.okToText),
          calledNumber,
        });
        const { businessData, businessTimezone, assignedInspectorName, ...stored } = appt;
        await logAction(businessId, callId, "bookAppointment", params, stored, "success");
        const tz = businessTimezone ?? inputTimezone;
        const whenStr = new Date(appt.startTime).toLocaleString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
        // Every AI booking waits for the office's OK. Say how and when the office confirms — "after hours" only when it
        // really is (2026-09-28: an 11:28 AM Monday booking was told "since we're currently after hours").
        const textTo = contactPhone(appt);
        // T-169: promise a text only when one can really go out — from the line this caller dialed, with texting Ready.
        const wantsText = isSmsEnabled(businessData) && appt.textOk === true && Boolean(textTo);
        const senderDb = wantsText ? getAdminFirestore() : null;
        const sender = senderDb ? await resolveSmsSender(senderDb, { businessId, calledNumber, purpose: "booking_received" }) : null;
        const texting = wantsText && sender?.ok === true;
        const confirmWhen = appt.bookedAfterHours
          ? (() => {
            const opening = nextOpeningLabel(Date.now(), tz, businessData.businessHours);
            return opening ? `when we open ${opening}` : "when the office opens";
          })()
          : "shortly";
        // Same rule as the office's Confirm button (src/lib/comms/confirmChannels.ts): every channel the caller gave.
        const confirmSentence = texting && appt.callerEmail
          ? `The office will confirm it by text and email ${confirmWhen}.`
          : texting
            ? `The office will confirm it by text ${confirmWhen}.`
            : appt.callerEmail
              ? `The office will confirm it by email ${confirmWhen}.`
              : `The office will call you ${confirmWhen} to confirm it.`;
        const sayToCaller = `You're booked for ${whenStr}. ${confirmSentence}`;
        const inspectorFirstName = assignedInspectorName?.split(/\s+/)[0];
        if (texting && textTo) {
          const pending = runAfterResponse("booking-received text", () => sendSms({
            businessId,
            to: textTo,
            body: bookingReceived({
              firstName: (appt.callerName ?? "").split(/\s+/)[0] || "there",
              businessName: typeof businessData.businessName === "string" ? businessData.businessName : "The office",
              when: new Date(appt.startTime).toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
              street: (appt.address ?? "your address").split(",")[0].trim() || "your address",
            }),
            messageType: "booking-received",
            entityId: appt.appointmentId,
            purpose: "booking_received",
            calledNumber,
          }));
          if (pending) await pending;
        }
        return {
          result: [
            `BOOKED: ${appt.callerName}, ${appt.serviceType ?? "appointment"} on ${whenStr}. Tell the caller: "${sayToCaller}"`,
            inspectorFirstName
              ? `${inspectorFirstName} is scheduled for the visit (the office can change it). If asked who is coming, say ${inspectorFirstName}.`
              : "If asked who is coming, say the office will let them know when it confirms.",
            "If the caller adds details now (a gate code, pets, parking, another phone number, anything the team should know), save each one with addBookingNote.",
            `Internal reference, NEVER read aloud or spell out: ${appt.appointmentId}. If the caller wants to change it later, look it up by their phone number instead.`,
          ].join(" "),
          sayToCaller,
        };
      }

      case "addBookingNote": {
        const note = optionalStr(params.note ?? params.notes);
        if (!note) return { result: "NOT SAVED: the note was empty. Ask the caller what to add." };
        const saved = await addBookingNote({ businessId, callId, note });
        if (!saved) {
          return {
            result: "NOT SAVED: there is no booking from this call to add it to. Book first with bookAppointment (put this in its notes), or take a message with createLead.",
          };
        }
        return {
          result: "SAVED: the note is on their booking for the team. Tell the caller it's added.",
          sayToCaller: "Got it, I've added that to your booking.",
        };
      }

      case "createLead": {
        const rawLeadName = optionalStr(params.name ?? params.callerName);
        const lead = await createLead({
          businessId,
          callerName: rawLeadName ? cleanCallerName(rawLeadName) : undefined,
          callerPhone: trustedCallerPhone,
          callbackPhone,
          callerEmail: normalizeSpokenEmail(params.email ?? params.callerEmail ?? params.customerEmail),
          serviceRequested: optionalStr(params.serviceRequested ?? params.service),
          address: optionalStr(params.address),
          urgency: parseUrgency(params.urgency),
          notes: withCallbackLine(optionalStr(params.notes)),
          sourceCallId: callId,
          calledNumber,
        });
        await logAction(businessId, callId, "createLead", params, lead, "success");
        return { result: `Lead captured for ${lead.callerName ?? "caller"}. The team will follow up.` };
      }

      case "escalateCall": {
        // Plan §2.1: the agent is shared by every tenant, so the switch is enforced here, not by removing the tool.
        // An unreadable business doc escalates as before — a read failure must never swallow a daycare's emergency.
        const escalationBusiness = await getBusinessData(businessId);
        if (escalationBusiness && !isEscalationEnabled(escalationBusiness)) {
          await logAction(businessId, callId, "escalateCall", { reason: params.reason, refused: "escalation_off" }, null, "failed");
          return {
            result: "NOT ESCALATED: this business does not hand calls to a person, and nobody was alerted. Treat it as urgent instead: call checkAvailability for the soonest opening, book it with notes starting \"URGENT: <what is happening>\", and tell the caller it is marked urgent. If anyone is in immediate danger, tell them to call 911 first, then keep helping them book.",
          };
        }
        const reason = String(params.reason ?? "Emergency reported by caller");
        const result = await escalateCall({
          businessId,
          callId,
          reason,
          callerPhone: provider === "elevenlabs" ? trustedCallerPhone : callerPhone ?? optionalStr(params.callerPhone),
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
        const tz = await getBusinessTimezone(businessId);
        const result = await checkAvailability({
          businessId,
          preferredDate: optionalStr(params.preferredDate),
          preferredTime: optionalStr(params.preferredTime),
          serviceType: optionalStr(params.serviceType ?? params.service),
          durationMinutes: typeof params.durationMinutes === "number" ? params.durationMinutes : undefined,
        });
        if (result.hoursStatus === "missing_or_invalid") {
          const lead = await createLead({
            businessId,
            callerName: optionalStr(params.name ?? params.callerName),
            callerPhone: trustedCallerPhone,
            callerEmail: normalizeSpokenEmail(params.email ?? params.callerEmail ?? params.customerEmail),
            serviceRequested: optionalStr(params.serviceType ?? params.service),
            address: optionalStr(params.address),
            urgency: parseUrgency(params.urgency),
            notes: optionalStr(params.notes) ?? "Availability requested, but business hours are not set up.",
            sourceCallId: callId,
          });
          await logAction(businessId, callId, "createLead", params, lead, "success");
          return {
            result: "Business hours are not set up yet. I've saved your details so the team can contact you about a time.",
            sayToCaller: "Business hours are not set up yet. I've saved your details so the team can contact you about a time.",
          };
        }
        if (!result.available || result.suggestedSlots.length === 0) {
          return { result: "No openings in the next few days. I can take a message and have someone reach out." };
        }
        const formatSlot = (value: string, withDate = true) => new Date(value).toLocaleString("en-US", {
          timeZone: tz,
          ...(withDate ? { weekday: "long" as const } : {}),
          hour: "numeric",
          minute: "2-digit",
        });
        const slots = result.suggestedSlots
          .slice(0, 3)
          .map((s) => formatSlot(s.startTime))
          .join("; ");
        const preferred = result.preferred;
        if (!preferred) return { result: `Available openings: ${slots}` };
        const requestedDay = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          weekday: "long",
        }).format(new Date(preferred.requestedStartTime));
        const requestedTime = formatSlot(preferred.requestedStartTime, false);
        const requested = `${requestedTime} ${requestedDay}`;
        const firstSentence = preferred.status === "open"
          ? `${requested} is open.`
          : preferred.status === "closed"
            ? `We're closed ${requestedDay}s.`
            : preferred.status === "outside_business_hours"
              ? `${requested} is outside business hours.`
              : preferred.status === "past"
                ? `${requested} has already passed.`
                : `${requested} is not open.`;
        return { result: `${firstSentence} Closest openings: ${slots}` };
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
        return {
          result,
          sayToCaller: result.replace(/\. Ask the caller[\s\S]*$/, "."),
        };
      }

      case "cancelAppointment": {
        const tz = await getBusinessTimezone(businessId);
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
        const sayToCaller = `Your ${cancellation.serviceType} appointment on ${appointmentTime} has been cancelled.`;
        return { result: sayToCaller, sayToCaller };
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
    if (name === "bookAppointment" && err instanceof Error &&
      ((err as { code?: unknown }).code === "slot_conflict" || (err as { code?: unknown }).code === "outside_business_hours")) {
      const tz = await getBusinessTimezone(businessId);
      const requestedStart = toTimestamp(params.startTime ?? params.preferredTime, tz);
      if (requestedStart !== undefined) {
        const requestedDate = localDateKey(requestedStart, tz);
        const preferredTime = new Intl.DateTimeFormat("en-US", {
          timeZone: tz, hour: "numeric", minute: "2-digit",
        }).format(new Date(requestedStart));
        const availability = await checkAvailability({
          businessId,
          preferredDate: requestedDate,
          preferredTime,
          serviceType: optionalStr(params.serviceType ?? params.service),
        });
        const requestedTimeLabel = new Intl.DateTimeFormat("en-US", {
          timeZone: tz, hour: "numeric", minute: "2-digit",
        }).format(new Date(requestedStart));
        const requestedDayLabel = new Intl.DateTimeFormat("en-US", {
          timeZone: tz, weekday: "long",
        }).format(new Date(requestedStart));
        const requestedLabel = `${requestedTimeLabel} ${requestedDayLabel}`;
        const alternatives = availability.suggestedSlots
          .filter((slot) => Date.parse(slot.startTime) !== requestedStart)
          .slice(0, 3)
          .map((slot) => new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            hour: "numeric",
            minute: "2-digit",
            ...(localDateKey(Date.parse(slot.startTime), tz) === requestedDate
              ? {}
              : { weekday: "long" as const }),
          }).format(new Date(slot.startTime)));
        // Wording matters: "8 AM Monday is booked" was read by the live agent as SUCCESS and it told the caller they
        // were booked (ElevenLabs agent test, 2026-09-27). The model-facing result says NOT booked up front; the
        // caller-facing sentence says "taken", never "booked".
        const why = (err as { code?: unknown }).code === "slot_conflict"
          ? `${requestedLabel} was just taken`
          : `${requestedLabel} is outside our business hours`;
        const offer = alternatives.length > 0 ? joinSpokenList(alternatives) : null;
        const sayToCaller = offer
          ? `Sorry, ${why}. The closest openings are ${offer}. Which works best for you?`
          : `Sorry, ${why}. I can take your details and have the team follow up.`;
        const result = offer
          ? `NOT BOOKED: ${why}. Nothing was booked for this caller. Offer them the closest openings: ${offer}.`
          : `NOT BOOKED: ${why}. Nothing was booked for this caller. Take their details with createLead so the team follows up.`;
        await logAction(businessId, callId, name, params, { error: err.message, alternatives }, "failed");
        return { result, sayToCaller };
      }
    }
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

function joinSpokenList(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} or ${values[1]}`;
  return `${values.slice(0, -1).join(", ")} or ${values.at(-1)}`;
}

function localDateKey(timestamp: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
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

function toTimestamp(v: unknown, tz = "America/New_York"): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    // Bare ISO string (no timezone) — treat as business local time, not UTC, since Vercel runs in UTC
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) && !v.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(v)) {
      const match = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
      if (!match) return undefined;
      return zonedDateTimeToUtc({
        year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
        hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] ?? 0),
      }, tz) ?? undefined;
    }
    const t = Date.parse(v);
    return Number.isNaN(t) ? undefined : t;
  }
  return undefined;
}

/**
 * The model sometimes passes an email the way it was spoken ("carla at example dot com" — ElevenLabs agent test,
 * 2026-09-28). Turn that into an address; anything that still isn't one is dropped rather than stored, because a
 * confirmation sent to it can only fail.
 */
export function normalizeSpokenEmail(value: unknown): string | undefined {
  const raw = optionalStr(value);
  if (!raw) return undefined;
  const email = raw
    .toLowerCase()
    .replace(/\s+(?:at|arroba)\s+/g, "@")
    .replace(/\s+(?:dot|punto)\s+/g, ".")
    .replace(/\s+/g, "");
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email) ? email : undefined;
}

/** A yes/no the model may send as a boolean or a word; anything else is "not asked". */
function parseYesNo(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v !== "string") return undefined;
  const value = v.trim().toLowerCase();
  if (["true", "yes", "y", "si", "sí", "ok", "okay"].includes(value)) return true;
  if (["false", "no", "n"].includes(value)) return false;
  return undefined;
}

/** The business doc, or null when it can't be read (callers then keep their pre-switch behaviour). */
async function getBusinessData(businessId: string): Promise<Record<string, unknown> | null> {
  const db = getAdminFirestore();
  if (!db) return null;
  try {
    return (await db.collection("businesses").doc(businessId).get()).data() ?? null;
  } catch {
    return null;
  }
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
