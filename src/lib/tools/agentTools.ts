import type { Appointment, Lead, AgentAction } from "@/types";
import { getAdminFirestore } from "@/lib/firebase/admin";
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

// Returns a Date representing `hour:00 AM/PM` in America/New_York for the given UTC date.
// Vercel runs in UTC, so setHours() would create UTC times — this fixes that.
function etHourToDate(utcDate: Date, hour: number): Date {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  });
  const tzPart = fmt.formatToParts(utcDate).find(p => p.type === "timeZoneName")?.value ?? "GMT-4";
  const m = tzPart.match(/GMT([+-])(\d+)/);
  const etOffsetHours = m ? (m[1] === "+" ? 1 : -1) * parseInt(m[2]) : -4;
  const utcHour = hour - etOffsetHours; // e.g. 9am ET: 9 - (-4) = 13 UTC
  return new Date(Date.UTC(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate(), utcHour, 0, 0, 0));
}

export async function checkAvailability(
  input: CheckAvailabilityInput
): Promise<CheckAvailabilityOutput> {
  const db = getAdminFirestore();
  if (!db) return { available: false, suggestedSlots: [] };

  try {
    const businessDoc = await db.collection("businesses").doc(input.businessId).get();
    if (!businessDoc.exists) return { available: false, suggestedSlots: [] };

    // Generate slots based on today + next 2 days during business hours (9am–5pm ET)
    const now = new Date();
    const slots: Array<{ startTime: string; endTime: string }> = [];
    for (let dayOffset = 1; dayOffset <= 3 && slots.length < 3; dayOffset++) {
      const day = new Date(now);
      day.setDate(day.getDate() + dayOffset);
      // Skip Sunday
      if (day.getDay() === 0) continue;
      const hours = day.getDay() === 6 ? [9, 11] : [9, 13, 15];
      for (const hour of hours) {
        const start = etHourToDate(day, hour);
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
  serviceType?: string;
  address?: string;
  startTime: number;
  endTime: number;
  sourceCallId?: string;
}

export async function bookAppointment(input: BookAppointmentInput): Promise<Appointment> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore not available");

  const businessRef = db.collection("businesses").doc(input.businessId);
  const businessDoc = await businessRef.get();
  if (!businessDoc.exists) throw new Error(`Business ${input.businessId} not found`);

  const businessData = businessDoc.data();

  const appointmentId = `apt_${Date.now()}`;
  const appointment: Appointment = {
    appointmentId,
    businessId: input.businessId,
    callerName: input.callerName,
    callerPhone: input.callerPhone,
    serviceType: input.serviceType,
    address: input.address,
    startTime: input.startTime,
    endTime: input.endTime,
    calendarProvider: "mock",
    status: "requested",
    sourceCallId: input.sourceCallId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await businessRef.collection("appointments").doc(appointmentId).set(appointment);

  // Notify business owner
  if (resend && businessData?.notificationEmail) {
    const startDate = new Date(input.startTime).toLocaleString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
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
    const escalationTime = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
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
      return `${a.callerName ?? "Unknown"} — ${a.serviceType ?? "service"} at ${a.address ?? "unknown address"} on ${t} (status: ${a.status})`;
    }).join("; ");
  } catch (err) {
    console.error("lookupAppointment error:", err);
    return "Error looking up appointment.";
  }
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
