/** A request waits this long before the Dashboard asks for attention (T-250). */
export const ATTENTION_WAITING_MS = 4 * 60 * 60 * 1000;

export interface AttentionLead {
  urgency?: string;
  status?: string;
  escalated?: boolean;
  callbackState?: string;
  callbackConsent?: boolean;
  createdAt?: number;
}

/**
 * Why an open request belongs in "Needs attention", in words, or null when it does not:
 * urgent/emergency, a requested call back, or still new after ATTENTION_WAITING_MS.
 */
export function attentionReason(lead: AttentionLead, now: number): string | null {
  if (lead.status !== "new") return null;
  if (lead.escalated === true) return "Emergency call";
  const urgency = lead.urgency?.toLowerCase();
  if (urgency === "urgent" || urgency === "emergency") return "Urgent request";
  if (lead.callbackState === "pending" || lead.callbackConsent === true) return "Caller asked for a call back";
  if (typeof lead.createdAt === "number") {
    const waiting = now - lead.createdAt;
    if (waiting > ATTENTION_WAITING_MS) return `Waiting ${Math.floor(waiting / 3_600_000)} h`;
  }
  return null;
}

export function needsAttention(lead: AttentionLead, now: number): boolean {
  return attentionReason(lead, now) !== null;
}
