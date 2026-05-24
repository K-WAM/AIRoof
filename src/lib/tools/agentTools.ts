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

export async function checkAvailability(
  input: CheckAvailabilityInput
): Promise<CheckAvailabilityOutput> {
  const db = getAdminFirestore();
  if (!db) return { available: false, suggestedSlots: [] };

  try {
    const businessDoc = await db.collection("businesses").doc(input.businessId).get();
    if (!businessDoc.exists) return { available: false, suggestedSlots: [] };

    // Generate slots based on today + next 2 days during business hours (9am–5pm)
    const now = new Date();
    const slots: Array<{ startTime: string; endTime: string }> = [];
    for (let dayOffset = 1; dayOffset <= 3 && slots.length < 3; dayOffset++) {
      const day = new Date(now);
      day.setDate(day.getDate() + dayOffset);
      // Skip Sunday
      if (day.getDay() === 0) continue;
      const hours = day.getDay() === 6 ? [9, 11] : [9, 13, 15];
      for (const hour of hours) {
        const start = new Date(day);
        start.setHours(hour, 0, 0, 0);
        const end = new Date(start);
        end.setHours(hour + 1);
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
    const startDate = new Date(input.startTime).toLocaleString("en-US", { timeZone: "America/New_York" });
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
      }),
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
      }),
    }).catch((err) => console.error("Escalation email failed:", err));
  }

  return { escalated: true, escalationTarget: escalationPhone };
}

const LOGO_URL = "https://ai-roof.vercel.app/logo.png";
const BASE_URL = "https://ai-roof.vercel.app";

function emailShell(headerBg: string, accentColor: string, badgeLabel: string, badgeColor: string, title: string, subtitle: string, cardRows: string, footer: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <tr><td style="background:${headerBg};padding:28px 32px;text-align:center;">
    <img src="${LOGO_URL}" alt="Luxor AI" height="36" style="display:block;margin:0 auto 14px;opacity:0.95;">
    <span style="display:inline-block;background:${badgeColor};color:#fff;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 10px;border-radius:20px;">${badgeLabel}</span>
  </td></tr>
  <tr><td style="padding:28px 32px 16px;">
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#0f172a;">${title}</h1>
    <p style="margin:0;font-size:14px;color:#64748b;line-height:1.5;">${subtitle}</p>
  </td></tr>
  <tr><td style="padding:0 32px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
    <tr><td style="padding:20px 24px;">${cardRows}</td></tr>
    </table>
  </td></tr>
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 32px;">
    <p style="margin:0;font-size:11px;color:#94a3b8;">${footer} · <a href="${BASE_URL}/company/dashboard" style="color:#6366f1;text-decoration:none;">View dashboard</a></p>
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

function bookingEmailHtml(p: { callerName: string; callerPhone: string; serviceType: string; startDate: string; address: string; callId: string }): string {
  const rows = [
    dataRow("Name", p.callerName),
    dataRow("Phone", p.callerPhone),
    dataRow("Service", p.serviceType),
    dataRow("Time", p.startDate),
    dataRow("Address", p.address),
  ].join("");
  return emailShell(
    "#0f172a", "#4f46e5",
    "New Booking", "#22c55e",
    `New Inspection Booked`,
    `Alice captured and confirmed this appointment on your behalf.`,
    rows,
    `Call ID: ${p.callId} · Powered by Luxor AI`
  );
}

function escalationEmailHtml(p: { callerPhone: string; reason: string; summary: string; callId: string; escalationTime: string }): string {
  const rows = [
    dataRow("Caller", p.callerPhone),
    dataRow("Reason", p.reason),
    dataRow("Summary", p.summary),
    dataRow("Time", p.escalationTime),
  ].join("");
  return emailShell(
    "#7f1d1d", "#dc2626",
    "Urgent Escalation", "#dc2626",
    `Urgent: Call Escalation`,
    `Alice flagged this call as urgent. Respond immediately.`,
    rows,
    `Call ID: ${p.callId} · Powered by Luxor AI`
  );
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
