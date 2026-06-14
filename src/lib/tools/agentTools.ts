import type { Appointment, Lead, AgentAction } from "@/types";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { initiateVapiCall } from "@/lib/vapi/vapiClient";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM ?? "Roofus <roofus@yourdomain.com>";

export interface CheckAvailabilityInput {
  businessId: string;
  preferredDate?: string;
  serviceType?: string;
  durationMinutes?: number;
}

export interface CheckAvailabilityOutput {
  available: boolean;
  suggestedSlots: Array<{ startTime: string; endTime: string }>;
}

const DEFAULT_TZ = "America/New_York";

// Reads timezone from business Firestore doc. Falls back to Eastern.
export async function getBusinessTimezone(businessId: string): Promise<string> {
  const db = getAdminFirestore();
  if (!db) return DEFAULT_TZ;
  try {
    const snap = await db.collection("businesses").doc(businessId).get();
    const tz = snap.data()?.timezone;
    return typeof tz === "string" && tz.length > 0 ? tz : DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}

// Returns a Date representing `hour:00` in the given IANA timezone for the given UTC date.
// Vercel runs in UTC, so setHours() creates UTC times — this fixes that.
function tzHourToDate(utcDate: Date, hour: number, tz: string): Date {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" });
  const tzPart = fmt.formatToParts(utcDate).find(p => p.type === "timeZoneName")?.value ?? "GMT-5";
  const m = tzPart.match(/GMT([+-])(\d+)/);
  const offsetHours = m ? (m[1] === "+" ? 1 : -1) * parseInt(m[2]) : -5;
  const utcHour = hour - offsetHours;
  return new Date(Date.UTC(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate(), utcHour, 0, 0, 0));
}

export async function checkAvailability(
  input: CheckAvailabilityInput
): Promise<CheckAvailabilityOutput> {
  const db = getAdminFirestore();
  if (!db) return { available: false, suggestedSlots: [] };

  try {
    const [businessDoc, tz] = await Promise.all([
      db.collection("businesses").doc(input.businessId).get(),
      getBusinessTimezone(input.businessId),
    ]);
    if (!businessDoc.exists) return { available: false, suggestedSlots: [] };

    const now = new Date();
    const slots: Array<{ startTime: string; endTime: string }> = [];
    for (let dayOffset = 1; dayOffset <= 3 && slots.length < 3; dayOffset++) {
      const day = new Date(now);
      day.setDate(day.getDate() + dayOffset);
      if (day.getDay() === 0) continue; // skip Sunday
      const hours = day.getDay() === 6 ? [9, 11] : [9, 13, 15];
      for (const hour of hours) {
        const start = tzHourToDate(day, hour, tz);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        slots.push({ startTime: start.toISOString(), endTime: end.toISOString() });
        if (slots.length >= 3) break;
      }
    }

    return { available: slots.length > 0, suggestedSlots: slots };
  } catch (error) {
    console.error("checkAvailability error:", error);
    return { available: false, suggestedSlots: [] };
  }
}

export interface BookAppointmentInput {
  businessId: string;
  callerName: string;
  callerPhone: string;
  callerEmail?: string;
  serviceType?: string;
  address?: string;
  notes?: string;
  startTime: number;
  endTime: number;
  sourceCallId?: string;
}

// True if `now` falls outside the configured business hours for today (in the business tz).
export function isAfterHoursNow(hours: Record<string, string>, tz: string): boolean {
  try {
    const now = new Date();
    const dayName = now.toLocaleDateString("en-US", { timeZone: tz, weekday: "long" });
    const todayHours = hours[dayName];
    if (!todayHours || todayHours.toLowerCase() === "closed") return true;
    const m = todayHours.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
    if (!m) return false;
    const open = parseInt(m[1]) * 60 + parseInt(m[2]);
    const close = parseInt(m[3]) * 60 + parseInt(m[4]);
    const local = new Date(now.toLocaleString("en-US", { timeZone: tz }));
    const cur = local.getHours() * 60 + local.getMinutes();
    return cur < open || cur >= close;
  } catch {
    return false;
  }
}

export async function bookAppointment(input: BookAppointmentInput): Promise<Appointment> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore not available");

  const businessRef = db.collection("businesses").doc(input.businessId);
  const businessDoc = await businessRef.get();
  if (!businessDoc.exists) throw new Error(`Business ${input.businessId} not found`);

  const businessData = businessDoc.data();

  // Alice books 24/7. If the call lands outside business hours, mark the appointment
  // pending so staff confirm it (and notify the customer) in the morning.
  const pendingConfirmation = isAfterHoursNow(businessData?.businessHours ?? {}, businessData?.timezone ?? DEFAULT_TZ);

  const appointmentId = `apt_${Date.now()}`;
  const appointment: Appointment = {
    appointmentId,
    businessId: input.businessId,
    callerName: input.callerName,
    callerPhone: input.callerPhone,
    callerEmail: input.callerEmail,
    serviceType: input.serviceType,
    address: input.address,
    notes: input.notes,
    startTime: input.startTime,
    endTime: input.endTime,
    calendarProvider: "mock",
    status: "requested",
    pendingConfirmation,
    sourceCallId: input.sourceCallId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await businessRef.collection("appointments").doc(appointmentId).set(appointment);

  // Notify business owner
  if (resend && businessData?.notificationEmail) {
    const biz_tz: string = businessData?.timezone ?? DEFAULT_TZ;
    const startDate = new Date(input.startTime).toLocaleString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", timeZone: biz_tz,
    });
    const biz: BizBranding = {
      businessName: businessData.businessName ?? "Your Roofing Company",
      brandColor: businessData.brandColor ?? null,
      logoUrl: businessData.logoUrl ?? null,
      contactPhone: businessData.contactPhone ?? null,
      contactEmail: businessData.contactEmail ?? null,
      websiteUrl: businessData.websiteUrl ?? null,
    };
    await resend.emails.send({
      from: FROM,
      to: businessData.notificationEmail,
      subject: `New Inspection Booked — ${input.callerName}`,
      html: bookingEmailHtml({
        callerName: input.callerName,
        callerPhone: input.callerPhone,
        serviceType: input.serviceType ?? "Not specified",
        startDate,
        address: input.address ?? "Not provided",
        callId: input.sourceCallId ?? "N/A",
      }, biz),
    }).catch((err) => console.error("Booking email failed:", err));
  }

  return appointment;
}

export interface CreateLeadInput {
  businessId: string;
  callerName?: string;
  callerPhone?: string;
  callerEmail?: string;
  serviceRequested?: string;
  address?: string;
  urgency: "low" | "normal" | "urgent" | "unknown";
  notes?: string;
  sourceCallId?: string;
}

export async function createLead(input: CreateLeadInput): Promise<Lead> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore not available");

  const businessRef = db.collection("businesses").doc(input.businessId);
  const businessDoc = await businessRef.get();
  if (!businessDoc.exists) throw new Error(`Business ${input.businessId} not found`);

  const leadId = `lead_${Date.now()}`;
  const lead: Lead = {
    leadId,
    businessId: input.businessId,
    callerName: input.callerName,
    callerPhone: input.callerPhone,
    callerEmail: input.callerEmail,
    serviceRequested: input.serviceRequested,
    address: input.address,
    urgency: input.urgency,
    notes: input.notes,
    sourceCallId: input.sourceCallId,
    status: "new",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await businessRef.collection("leads").doc(leadId).set(lead);

  // Auto-callback: if business has callbackDelayMinutes configured and lead has a phone number
  const bizData = businessDoc.data();
  const delayMinutes = typeof bizData?.callbackDelayMinutes === "number" ? bizData.callbackDelayMinutes : undefined;
  const vapiAssistantId = bizData?.vapiAssistantId as string | undefined;
  const vapiPhoneNumberId = bizData?.vapiPhoneNumberId as string | undefined;

  if (
    delayMinutes !== undefined &&
    vapiAssistantId &&
    vapiPhoneNumberId &&
    input.callerPhone &&
    (input.callerPhone.match(/\d/g) ?? []).length >= 7
  ) {
    const windowStart = typeof bizData?.callbackWindowStart === "number" ? bizData.callbackWindowStart : 8;
    const windowEnd = typeof bizData?.callbackWindowEnd === "number" ? bizData.callbackWindowEnd : 20;
    const tz = bizData?.timezone ?? DEFAULT_TZ;

    const nowLocal = new Date();
    const localHour = parseInt(nowLocal.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: tz }), 10);
    const withinWindow = localHour >= windowStart && localHour < windowEnd;

    if (withinWindow) {
      const scheduledAt = delayMinutes === 0
        ? undefined
        : new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();

      // Fire and forget — don't fail lead creation if Vapi call fails
      initiateVapiCall({
        assistantId: vapiAssistantId,
        phoneNumberId: vapiPhoneNumberId,
        customerNumber: input.callerPhone,
        scheduledAt,
        metadata: {
          businessId: input.businessId,
          leadId,
          callType: "outbound",
          trigger: "auto-callback",
        },
        assistantOverrides: {
          variableValues: { callType: "outbound", callContext: "Following up on your earlier inquiry" },
        },
      }).then(async (vapiCall) => {
        const canonicalCallId = `call_vapi_${vapiCall.id}`;
        const db2 = getAdminFirestore();
        if (!db2) return;
        const now2 = Date.now();
        await db2.collection("businesses").doc(input.businessId).collection("calls").doc(canonicalCallId).set({
          callId: canonicalCallId,
          businessId: input.businessId,
          callType: "outbound",
          targetPhone: input.callerPhone,
          status: "queued",
          initiatedByUid: "system",
          leadId,
          vapiCallId: vapiCall.id,
          callAttempt: 1,
          startedAt: now2,
          createdAt: now2,
          updatedAt: now2,
          messages: [],
        });
        // Track attempt count on the lead
        await businessRef.collection("leads").doc(leadId).update({
          callAttempts: 1,
          lastCallAttemptAt: now2,
          updatedAt: now2,
        });
      }).catch((err) => console.error("Auto-callback failed for lead", leadId, err));
    }
  }

  return lead;
}

export interface EscalateCallInput {
  businessId: string;
  callId: string;
  reason: string;
  callerPhone?: string;
  summary?: string;
}

export async function escalateCall(
  input: EscalateCallInput
): Promise<{ escalated: boolean; escalationTarget: string }> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore not available");

  const businessDoc = await db.collection("businesses").doc(input.businessId).get();
  if (!businessDoc.exists) throw new Error(`Business ${input.businessId} not found`);

  const businessData = businessDoc.data();
  const escalationPhone = businessData?.escalationPhone ?? "unknown";

  console.log(`ESCALATION: call ${input.callId} for ${input.businessId} — ${input.reason}`);

  if (resend && businessData?.notificationEmail) {
    const escalationTime = new Date().toLocaleString("en-US", { timeZone: businessData?.timezone ?? DEFAULT_TZ });
    const biz: BizBranding = {
      businessName: businessData.businessName ?? "Your Roofing Company",
      brandColor: businessData.brandColor ?? "#7f1d1d",
      logoUrl: businessData.logoUrl ?? null,
      contactPhone: businessData.contactPhone ?? null,
      contactEmail: businessData.contactEmail ?? null,
    };
    await resend.emails.send({
      from: FROM,
      to: businessData.notificationEmail,
      subject: `URGENT: Call Escalation — ${businessData.businessName ?? input.businessId}`,
      html: escalationEmailHtml({
        callerPhone: input.callerPhone ?? "Unknown",
        reason: input.reason,
        summary: input.summary ?? "No summary",
        callId: input.callId,
        escalationTime,
      }, biz),
    }).catch((err) => console.error("Escalation email failed:", err));
  }

  return { escalated: true, escalationTarget: escalationPhone };
}

const BASE_URL = "https://ai-roof.vercel.app";

interface BizBranding {
  businessName: string;
  brandColor?: string | null;
  logoUrl?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  websiteUrl?: string | null;
}

function brandHeader(biz: BizBranding): string {
  const bg = biz.brandColor ?? "#0f172a";
  const logo = biz.logoUrl
    ? `<img src="${biz.logoUrl}" alt="${biz.businessName}" height="44" style="display:block;margin:0 auto 12px;max-width:180px;">`
    : `<p style="margin:0 0 10px;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">${biz.businessName}</p>`;
  const contact = [biz.contactPhone, biz.contactEmail]
    .filter(Boolean).join(" &nbsp;·&nbsp; ");
  return `<td style="background:${bg};padding:28px 32px;text-align:center;">
    ${logo}
    ${contact ? `<p style="margin:0;font-size:12px;color:rgba(255,255,255,0.7);">${contact}</p>` : ""}
  </td>`;
}

function emailShell(biz: BizBranding, badgeLabel: string, badgeColor: string, title: string, subtitle: string, cardRows: string, callId: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <tr>${brandHeader(biz)}</tr>
  <tr><td style="padding:20px 32px 8px;">
    <span style="display:inline-block;background:${badgeColor};color:#fff;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 10px;border-radius:20px;">${badgeLabel}</span>
  </td></tr>
  <tr><td style="padding:12px 32px 16px;">
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#0f172a;">${title}</h1>
    <p style="margin:0;font-size:14px;color:#64748b;line-height:1.5;">${subtitle}</p>
  </td></tr>
  <tr><td style="padding:0 32px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
    <tr><td style="padding:20px 24px;">${cardRows}</td></tr>
    </table>
  </td></tr>
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:12px 32px;">
    <p style="margin:0;font-size:10px;color:#cbd5e1;">
      Call ID: ${callId} &nbsp;·&nbsp;
      <a href="${BASE_URL}/company/dashboard" style="color:#94a3b8;text-decoration:none;">View dashboard</a> &nbsp;·&nbsp;
      <span style="color:#e2e8f0;">Powered by Luxor AI</span>
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function dataRow(label: string, value: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
<tr>
  <td style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;vertical-align:top;width:110px;padding-top:2px;">${label}</td>
  <td style="font-size:14px;color:#1e293b;font-weight:500;">${value}</td>
</tr></table>`;
}

function bookingEmailHtml(
  p: { callerName: string; callerPhone: string; serviceType: string; startDate: string; address: string; callId: string },
  biz: BizBranding
): string {
  const rows = [
    dataRow("Name", p.callerName),
    dataRow("Phone", p.callerPhone),
    dataRow("Service", p.serviceType),
    dataRow("Appointment", p.startDate),
    dataRow("Address", p.address),
  ].join("");
  return emailShell(
    biz, "New Booking", "#22c55e",
    "New Inspection Booked",
    `Your AI receptionist captured and confirmed this appointment automatically.`,
    rows, p.callId
  );
}

function escalationEmailHtml(
  p: { callerPhone: string; reason: string; summary: string; callId: string; escalationTime: string },
  biz: BizBranding
): string {
  const rows = [
    dataRow("Caller", p.callerPhone),
    dataRow("Reason", p.reason),
    dataRow("Summary", p.summary),
    dataRow("Time", p.escalationTime),
  ].join("");
  return emailShell(
    biz, "Urgent Escalation", "#dc2626",
    "Urgent: Call Escalation",
    `Your AI receptionist flagged this call as urgent. Respond immediately.`,
    rows, p.callId
  );
}

export interface LookupAppointmentInput {
  businessId: string;
  callerPhone?: string;
  callerName?: string;
  address?: string;
}

export async function lookupAppointment(input: LookupAppointmentInput): Promise<string> {
  const db = getAdminFirestore();
  if (!db) return "Unable to look up appointments right now.";

  try {
    const snap = await db
      .collection("businesses").doc(input.businessId)
      .collection("appointments").get();

    if (snap.empty) return "No appointments found for this business.";

    const all = snap.docs.map((d) => d.data());

    // Priority: phone > name > address (each normalized to lowercase)
    let matches = all;
    if (input.callerPhone) {
      const normalized = input.callerPhone.replace(/\D/g, "");
      const byPhone = all.filter((a) => (a.callerPhone as string)?.replace(/\D/g, "") === normalized);
      if (byPhone.length > 0) matches = byPhone;
    }
    if (matches === all && input.callerName) {
      const name = input.callerName.toLowerCase();
      const byName = all.filter((a) => (a.callerName as string)?.toLowerCase().includes(name));
      if (byName.length > 0) matches = byName;
    }
    if (matches === all && input.address) {
      const addr = input.address.toLowerCase();
      const byAddr = all.filter((a) => (a.address as string)?.toLowerCase().includes(addr));
      if (byAddr.length > 0) matches = byAddr;
    }

    if (matches === all) return "No matching appointment found for that caller.";

    return matches.slice(0, 3).map((a) => {
      const t = new Date(a.startTime as number).toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
      });
      return `${a.callerName ?? "Unknown"} — ${a.serviceType ?? "service"} at ${a.address ?? "unknown address"} on ${t} (status: ${a.status}, appointmentId: ${a.appointmentId})`;
    }).join("; ");
  } catch (err) {
    console.error("lookupAppointment error:", err);
    return "Error looking up appointment.";
  }
}

export interface CancelAppointmentInput {
  businessId: string;
  appointmentId: string;
}

export async function cancelAppointment(input: CancelAppointmentInput): Promise<{ cancelled: boolean }> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore not available");

  const ref = db
    .collection("businesses").doc(input.businessId)
    .collection("appointments").doc(input.appointmentId);

  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Appointment ${input.appointmentId} not found`);

  await ref.update({ status: "cancelled", updatedAt: Date.now() });
  return { cancelled: true };
}

export interface GetCurrentDateInput {
  businessId: string;
}

export async function getCurrentDate(input: GetCurrentDateInput): Promise<{ today: string; isoDate: string; dayOfWeek: string }> {
  const tz = await getBusinessTimezone(input.businessId);
  const now = new Date();
  const today = now.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: tz,
  });
  const isoDate = now.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
  const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long", timeZone: tz });
  return { today, isoDate, dayOfWeek };
}

export async function logAgentAction(action: AgentAction): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;

  try {
    await db
      .collection("businesses")
      .doc(action.businessId)
      .collection("agentActions")
      .doc(action.actionId)
      .set(action);
  } catch (error) {
    console.error("logAgentAction error:", error);
  }
}
