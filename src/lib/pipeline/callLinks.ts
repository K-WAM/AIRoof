// Pure, unit-tested matcher linking a call forward to the lead/appointment
// it produced. Leads and appointments both carry `sourceCallId` (the id of
// the call whose transcript created them) — see src/types/index.ts — and
// the leads/appointments list routes return the full docs, so no extra API
// field is needed: the Calls page fetches those two lists and matches here.

export interface LinkedLead {
  leadId: string;
  sourceCallId?: string;
}

export interface LinkedAppointment {
  appointmentId: string;
  sourceCallId?: string;
}

export interface CallLinks {
  /** Present when a lead's sourceCallId matches the call. */
  leadId?: string;
  /** Present when an appointment's sourceCallId matches the call. */
  appointmentId?: string;
}

/**
 * Resolve which lead and/or appointment a call produced. Both can match
 * (e.g. an escalation that also booked); neither matching means the call
 * produced nothing linkable and callers should render no link at all.
 */
export function findCallLinks(
  callId: string,
  leads: LinkedLead[],
  appointments: LinkedAppointment[]
): CallLinks {
  const lead = leads.find((l) => l.sourceCallId === callId);
  const appt = appointments.find((a) => a.sourceCallId === callId);
  return {
    leadId: lead?.leadId,
    appointmentId: appt?.appointmentId,
  };
}
