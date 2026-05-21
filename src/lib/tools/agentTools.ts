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
      text: [
        `Name: ${input.callerName}`,
        `Phone: ${input.callerPhone}`,
        `Service: ${input.serviceType ?? "Not specified"}`,
        `Time: ${startDate}`,
        `Address: ${input.address ?? "Not provided"}`,
        `Call ID: ${input.sourceCallId ?? "N/A"}`,
      ].join("\n"),
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
    await resend.emails.send({
      from: FROM,
      to: businessData.notificationEmail,
      subject: `URGENT: Call Escalation — ${businessData.businessName ?? input.businessId}`,
      text: [
        `Caller: ${input.callerPhone ?? "Unknown"}`,
        `Reason: ${input.reason}`,
        `Summary: ${input.summary ?? "No summary"}`,
        `Call ID: ${input.callId}`,
        `Time: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}`,
        "",
        "Respond immediately.",
      ].join("\n"),
    }).catch((err) => console.error("Escalation email failed:", err));
  }

  return { escalated: true, escalationTarget: escalationPhone };
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
