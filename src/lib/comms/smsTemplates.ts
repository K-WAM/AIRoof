// Phase 31 (T-152): plain-text SMS bodies. Pure and deterministic — callers pass
// already-resolved display strings, and each body is capped at one SMS segment.

export const SMS_MAX_LENGTH = 320;

function clip(message: string): string {
  return message.length <= SMS_MAX_LENGTH
    ? message
    : `${message.slice(0, SMS_MAX_LENGTH - 1).trimEnd()}\u2026`;
}

/** Sent right after a booking is taken, before the office confirms it. */
export function bookingReceived(opts: {
  firstName: string;
  businessName: string;
  when: string;
  street: string;
}): string {
  return clip(
    `Hi ${opts.firstName}, ${opts.businessName} here. You're down for ${opts.when} at ${opts.street}. We'll text to confirm. Reply STOP to opt out.`
  );
}

/** Sent when the office confirms the appointment (or the AI books one that is confirmed). */
export function bookingConfirmed(opts: {
  service: string;
  when: string;
  street: string;
  businessName: string;
  businessPhone: string;
}): string {
  return clip(
    `Confirmed: ${opts.service} ${opts.when} at ${opts.street}. Questions? Call ${opts.businessPhone}. \u2013 ${opts.businessName}`
  );
}

/** Sent to the assigned inspector (crew row) when a booking lands on them. */
export function inspectorAssigned(opts: {
  when: string;
  street: string;
  customerName: string;
}): string {
  return clip(
    `New inspection: ${opts.when}, ${opts.street} (${opts.customerName}). Details in your email.`
  );
}
