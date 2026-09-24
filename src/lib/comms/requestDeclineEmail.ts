import type { Branding } from "@/lib/notify";

export const REQUEST_DECLINE_REASONS = [
  "Outside our service area",
  "Not a service we offer",
  "Fully booked",
  "Unable to reach you",
  "Other",
] as const;

export type RequestDeclineReason = (typeof REQUEST_DECLINE_REASONS)[number];

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

/** A deliberately neutral, customer-facing request outcome; all interpolated text is escaped. */
export function buildRequestDeclineEmail(input: {
  brand: Branding;
  clientName?: string;
  serviceType?: string;
  reason: RequestDeclineReason;
  customMessage?: string;
}): { subject: string; html: string } {
  const custom = input.customMessage?.trim();
  const detail = custom
    ? escapeHtml(custom)
    : "We’re unable to move forward with this request at this time.";
  const business = escapeHtml(input.brand.businessName);
  const accent = escapeHtml(input.brand.brandColor || "#0f766e");
  const contact = [input.brand.contactPhone, input.brand.contactEmail]
    .filter((value): value is string => Boolean(value))
    .map(escapeHtml).join(" &middot; ");
  return {
    subject: `${input.brand.businessName}: update on your request`,
    html: `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden"><tr><td style="background:${accent};padding:24px;color:#fff;font-size:20px;font-weight:700">${business}</td></tr><tr><td style="padding:28px;color:#334155;font-size:15px;line-height:1.6"><p>Hi ${escapeHtml(input.clientName || "there")},</p><p>Thank you for contacting us${input.serviceType ? ` about ${escapeHtml(input.serviceType)}` : ""}.</p><p>${detail}</p><p>If you have questions, please contact us directly.</p><p style="margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px">${contact}</p></td></tr></table></td></tr></table></body></html>`,
  };
}
