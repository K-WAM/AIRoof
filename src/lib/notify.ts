import { sendEmail } from "@/lib/comms/send";
import type { CommSendResult } from "@/lib/comms/send";
import { escapeHtml } from "@/lib/documents/letterhead";
import { TEAM_ROLE_LABEL, type TeamRole } from "@/types/team";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface Branding {
  businessName: string;
  brandColor?: string | null;
  logoUrl?: string | null;
  logoFilter?: string;
  logoChip?: boolean;
  contactPhone?: string | null;
  contactEmail?: string | null;
}

function shell(brand: Branding, heading: string, bodyHtml: string): string {
  const accent = /^#[0-9a-f]{6}$/i.test(brand.brandColor ?? "") ? brand.brandColor : "#0f766e";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
  <div style="background:${accent};padding:24px 32px;display:flex;align-items:center;gap:12px">
    ${brand.logoUrl ? `<span style="${brand.logoChip ? "background:#fff;padding:6px;border-radius:5px;" : ""}display:inline-block"><img src="${escapeHtml(brand.logoUrl)}" alt="${esc(brand.businessName)}" style="height:36px;max-width:120px;${brand.logoFilter ? `filter:${brand.logoFilter};` : ""}"/></span>` : ""}
    <div style="color:#fff;font-size:18px;font-weight:800">${esc(brand.businessName)}</div>
  </div>
  <div style="padding:28px 32px">
    <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a">${esc(heading)}</h1>
    ${bodyHtml}
    <div style="margin-top:28px;padding-top:16px;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8">
      ${[brand.contactPhone, brand.contactEmail].filter((v): v is string => !!v).map(esc).join(" &middot; ")}
      <div style="margin-top:4px">Powered by Luxor AI</div>
    </div>
  </div>
</div>
</body></html>`;
}

export function buildCrewAssignmentEmail(opts: {
  brand: Branding;
  crewName: string;
  /** Set when the email goes to one crew member rather than the crew's own address (T-148). */
  recipientName?: string;
  jobTitle: string;
  address?: string;
  clientName?: string;
  when: string;
  scope?: string;
}): { subject: string; html: string } {
  const rows = [
    ["Job", opts.jobTitle],
    ["When", opts.when],
    opts.recipientName ? ["Crew", opts.crewName] : null,
    opts.address ? ["Address", opts.address] : null,
    opts.clientName ? ["Client", opts.clientName] : null,
  ].filter(Boolean) as [string, string][];

  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6">Hi ${esc(opts.recipientName ?? opts.crewName)}, you've been assigned a job:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">
      ${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#64748b;width:90px">${esc(k)}</td><td style="padding:6px 0;color:#0f172a;font-weight:600">${esc(v)}</td></tr>`).join("")}
    </table>
    ${opts.scope ? `<div style="background:#f8fafc;border-radius:8px;padding:14px 16px;font-size:14px;color:#475569;line-height:1.6">${esc(opts.scope)}</div>` : ""}`;

  return {
    subject: `[Assignment] ${opts.jobTitle} \u2014 ${opts.when}`,
    html: shell(opts.brand, "You've got a new job", body),
  };
}

/** The one wording for a job's field link, so the text and the email say the same thing. */
export function fieldLinkMessage(opts: { businessName: string; jobTitle: string; address?: string | null; url: string }): string {
  const where = opts.address ? ` at ${opts.address}` : "";
  return `${opts.businessName}: log your work on "${opts.jobTitle}"${where}. Open, type your name, talk or type. No app or account: ${opts.url}`;
}

export function buildFieldLinkEmail(opts: { brand: Branding; jobTitle: string; address?: string | null; url: string }): { subject: string; html: string } {
  const body = `
    <p style="margin:0 0 8px;font-size:15px;color:#334155;line-height:1.6"><strong>${esc(opts.jobTitle)}</strong>${opts.address ? `<br/>${esc(opts.address)}` : ""}</p>
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6">Open the link on your phone, type your name, then talk or type what you did. No app or account.</p>
    <div style="margin:20px 0"><a href="${escapeHtml(opts.url)}" style="display:inline-block;background:${/^#[0-9a-f]{6}$/i.test(opts.brand.brandColor ?? "") ? opts.brand.brandColor : "#0f766e"};color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px">Log my work</a></div>
    <p style="margin:0;font-size:13px;color:#94a3b8">Keep this email — the same link works every day of the job.</p>`;
  return { subject: `Log your work: ${opts.jobTitle}`, html: shell(opts.brand, "Your job link", body) };
}

export type InspectionChange = "assigned" | "moved" | "reassigned" | "cancelled";

const INSPECTION_SUBJECT: Record<InspectionChange, string> = {
  assigned: "New inspection",
  moved: "Inspection moved",
  reassigned: "Inspection reassigned",
  cancelled: "Inspection cancelled",
};

/**
 * Phase 31 (T-152): the email an inspector gets when a booking lands on, moves off, or is cancelled on their row.
 * Everything on the wire is escaped like the other builders.
 */
export function buildInspectionEmail(opts: {
  brand: Branding;
  change: InspectionChange;
  when: string;
  customerName?: string;
  customerPhone?: string;
  address?: string;
  /** Notes lines that start "Access:" — gate codes / how to get in. */
  accessLines?: string[];
  /** Notes lines that start "URGENT:". */
  urgentLines?: string[];
  callSummary?: string;
}): { subject: string; html: string } {
  const heading = INSPECTION_SUBJECT[opts.change];
  const rows = [
    ["When", opts.when],
    opts.address ? ["Address", opts.address] : null,
    opts.customerName ? ["Customer", opts.customerName] : null,
    opts.customerPhone ? ["Phone", opts.customerPhone] : null,
  ].filter(Boolean) as [string, string][];
  const urgentLines = opts.urgentLines ?? [];
  const accessLines = opts.accessLines ?? [];
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6">${esc(heading)}:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">
      ${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#64748b;width:90px">${esc(k)}</td><td style="padding:6px 0;color:#0f172a;font-weight:600">${esc(v)}</td></tr>`).join("")}
    </table>
    ${urgentLines.length ? `<div style="background:#fef2f2;border-radius:8px;padding:14px 16px;font-size:14px;color:#7f1d1d;line-height:1.6;margin-bottom:12px">${urgentLines.map(esc).join("<br/>")}</div>` : ""}
    ${accessLines.length ? `<div style="background:#f8fafc;border-radius:8px;padding:14px 16px;font-size:14px;color:#475569;line-height:1.6;margin-bottom:12px">${accessLines.map(esc).join("<br/>")}</div>` : ""}
    ${opts.callSummary ? `<div style="background:#f8fafc;border-radius:8px;padding:14px 16px;font-size:14px;color:#475569;line-height:1.6">${esc(opts.callSummary)}</div>` : ""}`;

  return {
    subject: `[Inspection] ${heading} \u2014 ${opts.when}`,
    html: shell(opts.brand, heading, body),
  };
}

export function buildCustomerConfirmationEmail(opts: {
  brand: Branding;
  clientName?: string;
  serviceType?: string;
  when: string;
  address?: string;
}): { subject: string; html: string } {
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6">Hi ${esc(opts.clientName ?? "there")}, your appointment is confirmed:</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin-bottom:16px">
      <div style="font-size:18px;font-weight:800;color:#15803d">${esc(opts.when)}</div>
      ${opts.serviceType ? `<div style="font-size:14px;color:#166534;margin-top:4px">${esc(opts.serviceType)}</div>` : ""}
      ${opts.address ? `<div style="font-size:13px;color:#166534;margin-top:2px">${esc(opts.address)}</div>` : ""}
    </div>
    <p style="margin:0;font-size:14px;color:#475569">We'll see you then. Reply to this email if you need to reschedule.</p>`;

  return {
    subject: `[Appointment] Confirmed \u2014 ${opts.when}`,
    html: shell(opts.brand, "Appointment confirmed", body),
  };
}

export async function sendCustomerConfirmation(
  opts: {
    to: string;
    brand: Branding;
    clientName?: string;
    serviceType?: string;
    when: string;
    address?: string;
  },
): Promise<CommSendResult> {
  const { subject, html } = buildCustomerConfirmationEmail(opts);
  return sendEmail({ to: opts.to, subject, html, fromName: opts.brand.businessName, replyTo: opts.brand.contactEmail });
}

export function buildBusinessWelcomeEmail(opts: {
  brandName: string;
  ownerEmail: string;
  resetLink: string;
}): { subject: string; html: string } {
  const accent = "#1e3a5f";
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6">
      A ${esc(opts.brandName)} account has been created for you on Luxor AI.
      Your login email is <strong>${esc(opts.ownerEmail)}</strong>.
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6">
      Click the button below to set your password and get started.
    </p>
    <div style="margin:20px 0">
      <a href="${esc(opts.resetLink)}" style="display:inline-block;background:${accent};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Set your password</a>
    </div>
    <p style="margin:0;font-size:13px;color:#94a3b8">This link expires in 1 hour. If you didn\u2019t request this, you can safely ignore this email.</p>`;

  return {
    subject: `[Luxor AI] Your ${opts.brandName} account is ready`,
    html: shell(
      { businessName: "Luxor AI", brandColor: accent },
      `Welcome to ${esc(opts.brandName)}`,
      body,
    ),
  };
}

export async function sendBusinessWelcomeEmail(
  opts: {
    to: string;
    brandName: string;
    resetLink: string;
  },
): Promise<CommSendResult> {
  const { subject, html } = buildBusinessWelcomeEmail({
    ...opts,
    ownerEmail: opts.to,
  });
  return sendEmail({ to: opts.to, subject, html });
}

export function buildTeamInviteEmail(opts: {
  brand: Branding;
  inviteeEmail: string;
  role: TeamRole;
  resetLink: string;
}): { subject: string; html: string } {
  const roleLabel = TEAM_ROLE_LABEL[opts.role];
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6">
      You've been added to <strong>${esc(opts.brand.businessName)}</strong> on Luxor AI as a <strong>${esc(roleLabel)}</strong>.
      Your login email is <strong>${esc(opts.inviteeEmail)}</strong>.
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6">
      Click the button below to set your password and get started.
    </p>
    <div style="margin:20px 0">
      <a href="${esc(opts.resetLink)}" style="display:inline-block;background:${opts.brand.brandColor || "#1e3a5f"};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Set your password</a>
    </div>
    <p style="margin:0;font-size:13px;color:#94a3b8">This link expires in 1 hour. If you weren’t expecting this, you can safely ignore this email.</p>`;

  return {
    subject: `[Luxor AI] You've been added to ${opts.brand.businessName}`,
    html: shell(opts.brand, `Welcome to ${esc(opts.brand.businessName)}`, body),
  };
}

export async function sendTeamInviteEmail(
  opts: {
    to: string;
    brand: Branding;
    role: TeamRole;
    resetLink: string;
  },
): Promise<CommSendResult> {
  const { subject, html } = buildTeamInviteEmail({
    brand: opts.brand,
    inviteeEmail: opts.to,
    role: opts.role,
    resetLink: opts.resetLink,
  });
  return sendEmail({ to: opts.to, subject, html, fromName: opts.brand.businessName, replyTo: opts.brand.contactEmail });
}

export function buildFeedbackEmail(opts: {
  businessName: string;
  submitterName: string;
  submitterEmail: string;
  businessId: string;
  category?: string;
  message: string;
  /** The screen they were on, e.g. "/company/calendar". */
  page?: string;
  role?: string;
}): { subject: string; html: string } {
  // "[Feedback \u00b7 Bug report] Apex Roofing \u2014 The calendar won't let me drag\u2026" \u2014 sortable in the inbox at a glance.
  const flat = opts.message.replace(/\s+/g, " ").trim();
  const preview = flat.length > 60 ? `${flat.slice(0, 60).trim()}\u2026` : flat;
  const body = `
    <p style="margin:0 0 12px;font-size:15px;color:#334155;line-height:1.6">
      ${opts.category ? `<strong>Category:</strong> ${esc(opts.category)}<br/>` : ""}
      <strong>From:</strong> ${esc(opts.submitterName)} &lt;${esc(opts.submitterEmail)}&gt;${opts.role ? ` (${esc(opts.role)})` : ""}<br/>
      <strong>Company:</strong> ${esc(opts.businessName)} (${esc(opts.businessId)})
      ${opts.page ? `<br/><strong>Page:</strong> ${esc(opts.page)}` : ""}
    </p>
    <div style="background:#f8fafc;border-radius:8px;padding:14px 16px;font-size:14px;color:#334155;line-height:1.6;white-space:pre-wrap">${esc(opts.message)}</div>
    <p style="margin:12px 0 0;font-size:13px;color:#94a3b8">Reply to this email to answer ${esc(opts.submitterName)} directly.</p>`;

  return {
    subject: `[Feedback \u00b7 ${opts.category ?? "General"}] ${opts.businessName} \u2014 ${preview}`,
    html: shell(
      { businessName: "Luxor AI", brandColor: "#1e3a5f" },
      `Feedback from ${esc(opts.submitterName)}`,
      body,
    ),
  };
}

export async function sendFeedbackEmail(
  opts: {
    businessName: string;
    submitterName: string;
    submitterEmail: string;
    businessId: string;
    category?: string;
    message: string;
    page?: string;
    role?: string;
  },
): Promise<CommSendResult> {
  const { subject, html } = buildFeedbackEmail(opts);
  // Reply-to is the person who wrote it, so "Reply" in the inbox answers them (the email said so; it never did).
  return sendEmail({ to: "connect@luxordev.com", subject, html, replyTo: opts.submitterEmail || null });
}

function buildWebhookHealthAlertEmail(opts: {
  count: number;
  lastFailureAt: number | null;
}): { subject: string; html: string } {
  const when = opts.lastFailureAt
    ? new Date(opts.lastFailureAt).toISOString()
    : "unknown";
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6">
      The Vapi webhook (<code>/api/webhooks/vapi</code>) has rejected
      <strong>${opts.count}</strong> requests for bad authentication since the
      last check.
    </p>
    <div style="background:#fef2f2;border-radius:8px;padding:14px 16px;font-size:14px;color:#7f1d1d;line-height:1.6">
      Last failure: ${esc(when)}<br/>
      If this is unexpected, confirm the Server URL Secret in the Vapi
      dashboard still matches <code>VAPI_WEBHOOK_SECRET</code> in Vercel —
      a mismatch here silently fails every call.
    </div>`;

  return {
    subject: `[Alert] Vapi webhook auth failures — ${opts.count} since last check`,
    html: shell(
      { businessName: "Luxor AI", brandColor: "#b91c1c" },
      "Webhook auth-failure spike",
      body,
    ),
  };
}

export async function sendWebhookHealthAlert(opts: {
  count: number;
  lastFailureAt: number | null;
}): Promise<CommSendResult> {
  const { subject, html } = buildWebhookHealthAlertEmail(opts);
  return sendEmail({ to: "connect@luxordev.com", subject, html });
}
