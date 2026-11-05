export function parseDocumentRecipients(value: unknown): { recipients: string[] } | { error: string } {
  const raw = typeof value === "string" ? value.split(",") : value;
  if (!Array.isArray(raw) || raw.length === 0) return { error: "Enter at least one recipient email." };
  if (raw.length > 5) return { error: "Use at most 5 recipient email addresses." };
  const recipients: string[] = [];
  for (const value of raw) {
    const email = typeof value === "string" ? value.trim() : "";
    if (!email || email.length > 254 || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email) || /[\u0000-\u001f\u007f]/.test(email)) return { error: `Invalid email address: ${email || "(empty)"}` };
    if (!recipients.includes(email.toLowerCase())) recipients.push(email.toLowerCase());
  }
  return { recipients };
}

/** Each address passes independently through the existing sender and its guard/ledger. */
export async function deliverDocument(recipients: string[], send: (to: string) => Promise<{ status: string }>) {
  const delivered: string[] = [], failed: string[] = [];
  for (const to of recipients) {
    try { if ((await send(to)).status === "delivered") delivered.push(to); else failed.push(to); }
    catch { failed.push(to); }
  }
  return { delivered, failed };
}
export function deliveryWarning(result: { failed: string[]; delivered?: string[] }): string | undefined {
  return result.failed.length ? `Could not deliver to: ${result.failed.join(", ")}.${result.delivered?.length ? " Other recipients received their copy." : ""}` : undefined;
}
