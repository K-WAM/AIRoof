// Typed action interface for agent tools — all business-scoped
import type { Appointment, Lead, AgentAction } from "@/types";
import { getAdminFirestore } from "@/lib/firebase/admin";

// TODO: Mock implementations for now — wire to real calendar/database later

export interface CheckAvailabilityInput {
  businessId: string;
  preferredDate?: string;
  serviceType?: string;
  durationMinutes?: number;
}

export interface CheckAvailabilityOutput {
  available: boolean;
  suggestedSlots: Array<{
    startTime: string;
    endTime: string;
  }>;
}

export async function checkAvailability(
  input: CheckAvailabilityInput
): Promise<CheckAvailabilityOutput> {
  // Validate business exists
  const db = getAdminFirestore();
  if (!db) {
    return {
      available: false,
      suggestedSlots: [],
    };
  }

  try {
    const businessRef = db.collection("businesses").doc(input.businessId);
    const businessDoc = await businessRef.get();
    if (!businessDoc.exists) {
      console.error(`Business ${input.businessId} not found`);
      return { available: false, suggestedSlots: [] };
    }

    // TODO: Call Google Calendar API or use mock calendar
    // For now, return realistic mock slots
    const mockSlots = [
      { startTime: "2025-05-20T09:00:00Z", endTime: "2025-05-20T10:00:00Z" },
      { startTime: "2025-05-20T14:00:00Z", endTime: "2025-05-20T15:00:00Z" },
      { startTime: "2025-05-21T10:00:00Z", endTime: "2025-05-21T11:00:00Z" },
    ];

    return { available: true, suggestedSlots: mockSlots };
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

export async function bookAppointment(
  input: BookAppointmentInput
): Promise<Appointment> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore not available");

  try {
    // Validate business
    const businessRef = db.collection("businesses").doc(input.businessId);
    const businessDoc = await businessRef.get();
    if (!businessDoc.exists) {
      throw new Error(`Business ${input.businessId} not found`);
    }

    // Create appointment document
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

    // Store in Firestore
    await businessRef
      .collection("appointments")
      .doc(appointmentId)
      .set(appointment);

    return appointment;
  } catch (error) {
    console.error("bookAppointment error:", error);
    throw error;
  }
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

  try {
    // Validate business
    const businessRef = db.collection("businesses").doc(input.businessId);
    const businessDoc = await businessRef.get();
    if (!businessDoc.exists) {
      throw new Error(`Business ${input.businessId} not found`);
    }

    // Create lead document
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

    // Store in Firestore
    await businessRef.collection("leads").doc(leadId).set(lead);

    return lead;
  } catch (error) {
    console.error("createLead error:", error);
    throw error;
  }
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

  try {
    // Get business config for escalation contact
    const businessRef = db.collection("businesses").doc(input.businessId);
    const businessDoc = await businessRef.get();
    if (!businessDoc.exists) {
      throw new Error(`Business ${input.businessId} not found`);
    }

    const businessData = businessDoc.data();
    const escalationPhone = businessData?.escalationPhone || "unknown";

    // TODO: Send SMS/call to escalation phone, email to notification address
    console.log(
      `Escalating call ${input.callId} for business ${input.businessId} to ${escalationPhone}: ${input.reason}`
    );

    return { escalated: true, escalationTarget: escalationPhone };
  } catch (error) {
    console.error("escalateCall error:", error);
    return { escalated: false, escalationTarget: "" };
  }
}

// Log agent action to Firestore
export async function logAgentAction(action: AgentAction): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;

  try {
    const businessRef = db.collection("businesses").doc(action.businessId);
    await businessRef
      .collection("agentActions")
      .doc(action.actionId)
      .set(action);
  } catch (error) {
    console.error("logAgentAction error:", error);
  }
}
