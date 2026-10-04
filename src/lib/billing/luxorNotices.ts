// Luxor's own billing emails to clients (owner, 2026-10-04: "payment reminders, automated email confirmation of
// payments received, using resend"). Pure builders + the reminder schedule, so the cron and the Mark-paid route share
// one wording and one rule. Sending happens in the callers through sendEmail() (Resend).

import type { LuxorInvoice } from "@/app/admin/invoices/invoiceFlow";

/** Reminder emails go out this many days after the due date, each once. */
export const REMINDER_DAYS = [1, 7, 14] as const;
/** Past this many days overdue the Invoices page suggests pausing the client. */
export const PAUSE_SUGGEST_DAYS = 21;

const DAY = 24 * 60 * 60 * 1000;

/** The due date is a YYYY-MM-DD string; it counts as due at the END of that day (UTC). */
export function daysOverdue(invoice: Pick<LuxorInvoice, "dueDate" | "status">, now = Date.now()): number {
  if (invoice.status !== "sent" || !/^\d{4}-\d{2}-\d{2}$/.test(invoice.dueDate ?? "")) return 0;
  const dueEnd = Date.parse(`${invoice.dueDate}T23:59:59Z`);
  return now > dueEnd ? Math.floor((now - dueEnd) / DAY) + 1 : 0;
}

/** Which reminder (1, 7 or 14) is due now and not yet sent, or null. Only the latest missed one is sent — never three at once. */
export function reminderDue(invoice: Pick<LuxorInvoice, "dueDate" | "status"> & { remindersSent?: number[] }, now = Date.now()): number | null {
  const late = daysOverdue(invoice, now);
  const sent = new Set(invoice.remindersSent ?? []);
  const due = [...REMINDER_DAYS].reverse().find((d) => late >= d);
  return due !== undefined && !sent.has(due) && !(invoice.remindersSent ?? []).some((s) => s > due) ? due : null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const usd = (n: number) => `$${Number(n || 0).toFixed(2)}`;

function shell(heading: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Inter,system-ui,sans-serif;color:#1e293b;background:#f8fafc;margin:0;padding:32px 0;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:#0f172a;padding:24px 32px;color:#fff;font-size:20px;font-weight:800;">Luxor AI</div>
  <div style="padding:28px 32px;">
    <h1 style="margin:0 0 14px;font-size:20px;color:#0f172a;">${esc(heading)}</h1>
    ${body}
    <p style="margin:28px 0 0;font-size:12px;color:#94a3b8;">Luxor Developments LLC · Questions? Reply to this email.</p>
  </div>
</div></body></html>`;
}

export function buildLuxorReceiptEmail(invoice: Pick<LuxorInvoice, "invoiceId" | "clientName" | "total">, paidAt = Date.now()) {
  const when = new Date(paidAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hi ${esc(invoice.clientName || "there")}, thank you — we received your payment.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:6px 0;color:#64748b;">Invoice</td><td style="padding:6px 0;text-align:right;font-weight:600;">${esc(invoice.invoiceId)}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Amount paid</td><td style="padding:6px 0;text-align:right;font-weight:700;">${usd(invoice.total)}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Date</td><td style="padding:6px 0;text-align:right;">${esc(when)}</td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:14px;color:#15803d;font-weight:600;">Paid in full. Keep this email as your receipt.</p>`;
  return { subject: `[Receipt] Payment received — ${invoice.invoiceId}`, html: shell("Payment received", body) };
}

export function buildLuxorReminderEmail(invoice: Pick<LuxorInvoice, "invoiceId" | "clientName" | "total" | "dueDate" | "stripePaymentUrl">, lateDays: number) {
  const firm = lateDays >= 14;
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hi ${esc(invoice.clientName || "there")}, invoice <b>${esc(invoice.invoiceId)}</b> for <b>${usd(invoice.total)}</b> was due on ${esc(invoice.dueDate)}${lateDays > 0 ? ` (${lateDays} day${lateDays === 1 ? "" : "s"} ago)` : ""}.</p>
    ${invoice.stripePaymentUrl ? `<div style="margin:20px 0;"><a href="${esc(invoice.stripePaymentUrl)}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:700;">Pay ${usd(invoice.total)}</a></div>` : ""}
    <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">${firm
      ? "To keep your dashboard open, please pay this week. Your phone line keeps answering either way."
      : "If you've already paid, thank you — please ignore this."}</p>`;
  return { subject: `${firm ? "[Final reminder]" : "[Reminder]"} Invoice ${invoice.invoiceId} is overdue`, html: shell(firm ? "Payment overdue" : "A friendly reminder", body) };
}
