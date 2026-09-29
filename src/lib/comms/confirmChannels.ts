// How a booking's confirmation reaches the customer (owner, 2026-09-28: "our confirmations should just be emails or texts
// based on what is received in the call"). No picker, no AI phone call: every channel the caller gave is used —
//   - email, when they gave one;
//   - text, when they said it's OK to text (textOk === true) and texting is switched on for the business;
//   - both, when they gave both (also the safety net while US carrier registration can still drop a text);
//   - neither: the office phones them itself — the screen shows their number.
// Shared by the confirm route and every screen that confirms, so the button label always says what will happen.

export type ConfirmChannel = "sms" | "email";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function confirmChannels(input: {
  smsEnabled: boolean;
  phone?: string | null;
  textOk?: boolean | null;
  email?: string | null;
}): ConfirmChannel[] {
  const channels: ConfirmChannel[] = [];
  if (typeof input.email === "string" && EMAIL.test(input.email.trim())) channels.push("email");
  if (input.smsEnabled && input.textOk === true && typeof input.phone === "string" && input.phone.replace(/\D/g, "").length >= 7) {
    channels.push("sms");
  }
  return channels;
}

/** "Confirm & email + text" / "Confirm & email" / "Confirm & text" / "Confirm". */
export function confirmButtonLabel(channels: readonly ConfirmChannel[]): string {
  if (channels.includes("email") && channels.includes("sms")) return "Confirm & email + text";
  if (channels.includes("email")) return "Confirm & email";
  if (channels.includes("sms")) return "Confirm & text";
  return "Confirm";
}

/** For the toast after confirming: "emailed and texted" / "emailed" / "texted" / null (nobody was told). */
export function notifiedPhrase(channels: readonly ConfirmChannel[] | null | undefined): string | null {
  const list = channels ?? [];
  if (list.includes("email") && list.includes("sms")) return "emailed and texted";
  if (list.includes("email")) return "emailed";
  if (list.includes("sms")) return "texted";
  return null;
}
