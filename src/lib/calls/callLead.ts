// End-of-call safety net: no caller who asked for something is ever invisible in the Pipeline.
//
// The Pipeline and a call's "This call produced" box show only leads/appointments linked to the call (sourceCallId).
// The AI creates those through its tools — but a call can end without one: the model escalated before the escalation
// created leads (owner's demo, 2026-09-25), or said "you're booked" without calling bookAppointment. After the call is
// classified, a call the classifier says produced a request but that has NO linked record gets a lead. Jobs are still
// never created automatically — a lead is only a request for a human to review.

import type { Firestore } from "firebase-admin/firestore";
import { createLead } from "@/lib/tools/agentTools";
import type { CallOutcomeOutput } from "@/lib/schemas/ai";
import type { Lead } from "@/types";

const REQUEST_OUTCOMES = new Set<CallOutcomeOutput["outcome"]>(["escalated", "lead_captured", "scheduled"]);

export interface EnsureCallLeadInput {
  businessId: string;
  callId: string;
  callerPhone: string | null;
  summary: string | null;
  classification: CallOutcomeOutput;
}

export type EnsureCallLeadResult = "created" | "enriched" | "exists" | "skipped";

export async function ensureCallLead(db: Firestore, input: EnsureCallLeadInput): Promise<EnsureCallLeadResult> {
  const { classification: c } = input;
  if (!input.callId || !REQUEST_OUTCOMES.has(c.outcome)) return "skipped";

  const biz = db.collection("businesses").doc(input.businessId);
  const [leads, appointments] = await Promise.all([
    biz.collection("leads").where("sourceCallId", "==", input.callId).limit(1).get(),
    biz.collection("appointments").where("sourceCallId", "==", input.callId).limit(1).get(),
  ]);

  if (!leads.empty) {
    // An escalation lead only knows the phone number and the reason (escalateCall takes no name or address) — fill in
    // what the caller said, without overwriting anything a person or the AI already recorded.
    const existing = leads.docs[0].data() as Lead;
    const fill: Partial<Lead> = {};
    if (!existing.callerName?.trim() && c.callerName) fill.callerName = c.callerName;
    if (!existing.address?.trim() && c.address) fill.address = c.address;
    if (Object.keys(fill).length === 0) return "exists";
    await leads.docs[0].ref.update({ ...fill, updatedAt: Date.now() });
    return "enriched";
  }
  if (!appointments.empty) return "exists";

  // Nobody to call back and nothing to go on: the call record itself is all there is.
  if (!input.callerPhone && !c.callerName) return "skipped";

  const summary = input.summary?.trim();
  const notes = c.outcome === "scheduled"
    ? `The AI told this caller they were booked, but no appointment was saved. Call them to confirm a time.${summary ? `\n${summary}` : ""}`
    : summary || undefined;
  await createLead({
    businessId: input.businessId,
    callerName: c.callerName,
    callerPhone: input.callerPhone ?? undefined,
    serviceRequested: c.service ?? c.reason,
    address: c.address,
    urgency: c.outcome === "escalated" ? "urgent" : "normal",
    notes,
    sourceCallId: input.callId,
    ...(c.outcome === "escalated" ? { escalated: true, escalationReason: c.reason } : {}),
  });
  return "created";
}
