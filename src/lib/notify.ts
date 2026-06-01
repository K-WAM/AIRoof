// Notification layer. Email now (Resend); SMS is a documented seam for later
// (Twilio A2P 10DLC). Keep all outbound messaging behind these helpers so adding
// SMS is a one-place change.

import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM ?? "Luxor AI <noreply@luxordev.com>";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface Branding {
  businessName: string;
  brandColor?: string | null;
  logoUrl?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
}

function shell(brand: Branding, heading: string, bodyHtml: string): string {
  const accent = brand.brandColor || "#1e3a5f";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
  <div style="background:${accent};padding:24px 32px;display:flex;align-items:center;gap:12px">
    ${brand.logoUrl ? `<img src="${brand.logoUrl}" style="height:36px;filter:brightness(0) invert(1)"/>` : ""}
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

export async function sendCrewAssignment(opts: {
  to: string;
  brand: Branding;
  crewName: string;
  jobTitle: string;
  address?: string;
  clientName?: string;
  when: string;       // formatted date/time
  scope?: string;
}): Promise<boolean> {
  if (!resend) return false;
  const rows = [
    ["Job", opts.jobTitle],
    ["When", opts.when],
    opts.address ? ["Address", opts.address] : null,
    opts.clientName ? ["Client", opts.clientName] : null,
  ].filter(Boolean) as [string, string][];

  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6">Hi ${esc(opts.crewName)}, you've been assigned a job:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">
      ${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#64748b;width:90px">${esc(k)}</td><td style="padding:6px 0;color:#0f172a;font-weight:600">${esc(v)}</td></tr>`).join("")}
    </table>
    ${opts.scope ? `<div style="background:#f8fafc;border-radius:8px;padding:14px 16px;font-size:14px;color:#475569;line-height:1.6">${esc(opts.scope)}</div>` : ""}`;

  await resend.emails.send({ from: FROM, to: opts.to, subject: `New assignment: ${opts.jobTitle} — ${opts.when}`, html: shell(opts.brand, "You've got a new job", body) });
  return true;
}

export async function sendCustomerConfirmation(opts: {
  to: string;
  brand: Branding;
  clientName?: string;
  serviceType?: string;
  when: string;
  address?: string;
}): Promise<boolean> {
  if (!resend) return false;
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6">Hi ${esc(opts.clientName ?? "there")}, your appointment is confirmed:</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin-bottom:16px">
      <div style="font-size:18px;font-weight:800;color:#15803d">${esc(opts.when)}</div>
      ${opts.serviceType ? `<div style="font-size:14px;color:#166534;margin-top:4px">${esc(opts.serviceType)}</div>` : ""}
      ${opts.address ? `<div style="font-size:13px;color:#166534;margin-top:2px">${esc(opts.address)}</div>` : ""}
    </div>
    <p style="margin:0;font-size:14px;color:#475569">We'll see you then. Reply to this email if you need to reschedule.</p>`;

  await resend.emails.send({ from: FROM, to: opts.to, subject: `Appointment confirmed — ${opts.when}`, html: shell(opts.brand, "Appointment confirmed", body) });
  return true;
}
