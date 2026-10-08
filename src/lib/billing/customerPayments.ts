// Billing without Stripe (owner, 2026-10-08): "I don't want Stripe invoices — I want to produce the invoices for the
// client, who then receives payment." The client's customer pays the client however the client already gets paid
// (Zelle, check, card on their own Square/PayPal page…); this app prints those instructions on the invoice, lets the
// office record each payment, emails a receipt, and sends polite reminders when an invoice runs late.
//
// Pure rules + email builders only, so the payments route, the reminders cron and the Billing screen share ONE
// definition of balance, overdue and "paid in full". Money is rounded to cents everywhere (roundCents).

import type { BusinessConfig } from "@/types";
import type { InvoicePayment, JobInvoice } from "@/types/invoice";
import { escapeHtml } from "@/lib/documents/letterhead";
import { fmtMoney, roundCents } from "@/lib/format/money";

export const PAYMENT_METHODS = ["cash", "check", "card", "bank", "zelle", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash", check: "Check", card: "Card", bank: "Bank transfer", zelle: "Zelle", other: "Other",
};

/** Customer reminders go out this many days after the due date, each at most once. */
export const CUSTOMER_REMINDER_DAYS = [1, 7, 14] as const;
export const MAX_PAYMENTS_PER_INVOICE = 50;
const DAY = 24 * 60 * 60 * 1000;

// ── Payment settings (Settings → Getting paid) ─────────────────────────────────────────────────────────────────────

export type BillingPrefs = NonNullable<BusinessConfig["billingPrefs"]>;
export interface EffectiveBillingPrefs { payInstructions: string; payLink: string; remindersOn: boolean; dueDays: number }

export function effectiveBillingPrefs(config: { billingPrefs?: BillingPrefs } | null | undefined): EffectiveBillingPrefs {
  const p = config?.billingPrefs ?? {};
  return {
    payInstructions: typeof p.payInstructions === "string" ? p.payInstructions : "",
    payLink: typeof p.payLink === "string" && isSafePayLink(p.payLink) ? p.payLink : "",
    remindersOn: p.remindersOn !== false,
    dueDays: Number.isInteger(p.dueDays) && p.dueDays! >= 0 && p.dueDays! <= 120 ? p.dueDays! : 0,
  };
}

/** Only an https page on a real host — never javascript:, data: or a bare word — because it becomes a button in an email. */
export function isSafePayLink(value: string): boolean {
  if (value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/** Validates Settings → Getting paid. Returns the cleaned prefs or a plain-language error. */
export function parseBillingPrefs(input: unknown): { prefs: BillingPrefs } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Payment settings are missing." };
  const raw = input as Record<string, unknown>;
  const prefs: BillingPrefs = {};
  if (raw.payInstructions !== undefined) {
    if (typeof raw.payInstructions !== "string") return { error: "How customers pay must be text." };
    const text = raw.payInstructions.trim();
    if (text.length > 600) return { error: "Keep how customers pay under 600 characters." };
    if (/[<>]/.test(text)) return { error: "How customers pay can't contain < or >." };
    prefs.payInstructions = text;
  }
  if (raw.payLink !== undefined) {
    if (typeof raw.payLink !== "string") return { error: "The pay link must be a web address." };
    const link = raw.payLink.trim();
    if (link && !isSafePayLink(link)) return { error: "The pay link must start with https:// (your Square, PayPal or QuickBooks pay page)." };
    prefs.payLink = link;
  }
  if (raw.remindersOn !== undefined) {
    if (typeof raw.remindersOn !== "boolean") return { error: "Reminders must be on or off." };
    prefs.remindersOn = raw.remindersOn;
  }
  if (raw.dueDays !== undefined) {
    const n = Number(raw.dueDays);
    if (!Number.isInteger(n) || n < 0 || n > 120) return { error: "Payment terms must be 0 to 120 days." };
    prefs.dueDays = n;
  }
  return { prefs };
}

// ── Balance and payments ────────────────────────────────────────────────────────────────────────────────────────────

type Money = Pick<JobInvoice, "total" | "amountPaid" | "status">;

export function invoiceBalance(invoice: Money): number {
  if (invoice.status === "void") return 0;
  return Math.max(0, roundCents((invoice.total ?? 0) - (invoice.amountPaid ?? 0)));
}

/** Validates one recorded payment. `balance` caps it: the office can't record more than is owed. */
export function parsePayment(input: unknown, balance: number, now = Date.now()): { payment: Omit<InvoicePayment, "paymentId" | "recordedBy" | "recordedAt"> } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Payment details are missing." };
  const raw = input as Record<string, unknown>;
  const amount = roundCents(Number(raw.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the amount received." };
  if (amount > roundCents(balance)) return { error: `That's more than the ${fmtMoney(balance)} still owed.` };
  const method = String(raw.method ?? "other") as PaymentMethod;
  if (!PAYMENT_METHODS.includes(method)) return { error: "Pick how they paid." };
  const receivedAt = raw.receivedAt === undefined ? now : Number(raw.receivedAt);
  // A payment can be back-dated (a check that arrived last week) but not dated in the future.
  if (!Number.isFinite(receivedAt) || receivedAt <= 0 || receivedAt > now + DAY) return { error: "The date received can't be in the future." };
  const note = raw.note === undefined ? "" : String(raw.note).trim();
  if (note.length > 200 || /[<>]/.test(note)) return { error: "Keep the note under 200 characters, without < or >." };
  return { payment: { amount, method, receivedAt, ...(note ? { note } : {}) } };
}

/** The invoice fields after adding a payment. Paid in full = status "paid" (and paidAt = when the last of it arrived). */
export function applyPayment(invoice: Pick<JobInvoice, "total" | "amountPaid" | "status" | "payments">, payment: InvoicePayment): Pick<JobInvoice, "payments" | "amountPaid" | "status" | "paidAt"> & { paidInFull: boolean } {
  const payments = [...(invoice.payments ?? []), payment];
  const amountPaid = roundCents(payments.reduce((sum, p) => sum + p.amount, 0));
  const paidInFull = amountPaid >= roundCents(invoice.total) - 0.004;
  return { payments, amountPaid, status: paidInFull ? "paid" : invoice.status, ...(paidInFull ? { paidAt: payment.receivedAt } : {}), paidInFull };
}

// ── Overdue + reminders ─────────────────────────────────────────────────────────────────────────────────────────────

/** Whole days past the due date (due at the END of the due day in the business's zone ≈ +1 day). 0 = not late. */
export function daysPastDue(invoice: Pick<JobInvoice, "status" | "dueAt" | "total" | "amountPaid">, now = Date.now()): number {
  if (invoice.status !== "sent" || !invoice.dueAt || invoiceBalance(invoice) <= 0) return 0;
  const dueEnd = invoice.dueAt + DAY;
  return now > dueEnd ? Math.floor((now - dueEnd) / DAY) + 1 : 0;
}

/** Which reminder (1, 7 or 14) is due and not yet sent, or null. A missed one is skipped, never sent three at once. */
export function customerReminderDue(invoice: Pick<JobInvoice, "status" | "dueAt" | "total" | "amountPaid" | "remindersSent">, now = Date.now()): number | null {
  const late = daysPastDue(invoice, now);
  if (!late) return null;
  const sent = invoice.remindersSent ?? [];
  const due = [...CUSTOMER_REMINDER_DAYS].reverse().find((d) => late >= d);
  if (due === undefined || sent.includes(due) || sent.some((s) => s > due)) return null;
  return due;
}

// ── Emails (to the CLIENT's customer, from the client's name) ───────────────────────────────────────────────────────

export interface PayBusiness { businessName: string; brandColor?: string | null; contactPhone?: string; contactEmail?: string }

const usd = (n: number) => fmtMoney(n);
const accentOf = (c?: string | null) => (/^#[0-9a-f]{6}$/i.test(c ?? "") ? c! : "#0f766e");

/** "How to pay" — printed on the invoice email, reminders and the in-app invoice. Empty when nothing is set. */
export function howToPayBlock(prefs: Pick<EffectiveBillingPrefs, "payInstructions" | "payLink">, amount: number, brandColor?: string | null): string {
  if (!prefs.payInstructions && !prefs.payLink) return "";
  const button = prefs.payLink
    ? `<p style="margin:12px 0 4px"><a href="${escapeHtml(prefs.payLink)}" style="display:inline-block;background:${accentOf(brandColor)};color:#fff;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:700">Pay ${usd(amount)}</a></p>`
    : "";
  const text = prefs.payInstructions ? `<div style="white-space:pre-wrap;font-size:13px;line-height:1.6;color:#334155">${escapeHtml(prefs.payInstructions)}</div>` : "";
  return `<section style="margin-top:20px;padding:14px 16px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:6px">How to pay</div>${text}${button}</section>`;
}

function shell(business: PayBusiness, heading: string, body: string): string {
  const contact = [business.contactPhone, business.contactEmail].filter(Boolean).map((v) => escapeHtml(v!)).join(" · ");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0;padding:24px 0;background:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1e293b">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
<div style="background:${accentOf(business.brandColor)};padding:20px 28px;color:#fff;font-size:19px;font-weight:800">${escapeHtml(business.businessName)}</div>
<div style="padding:24px 28px"><h1 style="margin:0 0 12px;font-size:19px;color:#0f172a">${escapeHtml(heading)}</h1>${body}
<p style="margin:24px 0 0;font-size:12px;color:#94a3b8">${escapeHtml(business.businessName)}${contact ? ` · ${contact}` : ""} · Questions? Reply to this email.</p></div></div></body></html>`;
}

export function buildCustomerReceiptEmail(invoice: Pick<JobInvoice, "invoiceId" | "billTo" | "total">, payment: Pick<InvoicePayment, "amount" | "method" | "receivedAt">, balanceAfter: number, business: PayBusiness, timezone = "America/New_York") {
  const when = new Date(payment.receivedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: timezone });
  const row = (k: string, v: string, bold = false) => `<tr><td style="padding:6px 0;color:#64748b">${k}</td><td style="padding:6px 0;text-align:right;${bold ? "font-weight:700" : ""}">${escapeHtml(v)}</td></tr>`;
  const body = `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">Hi ${escapeHtml(invoice.billTo.name || "there")}, thank you — we received your payment.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">${row("Invoice", invoice.invoiceId)}${row("Amount received", usd(payment.amount), true)}${row("Paid by", PAYMENT_METHOD_LABEL[payment.method as PaymentMethod] ?? "Other")}${row("Date", when)}${row("Balance remaining", usd(balanceAfter), true)}</table>
<p style="margin:16px 0 0;font-size:14px;font-weight:600;color:${balanceAfter > 0 ? "#92400e" : "#15803d"}">${balanceAfter > 0 ? `${usd(balanceAfter)} is still due on this invoice.` : "Paid in full. Keep this email as your receipt."}</p>`;
  return { subject: `[Receipt] Payment received — ${invoice.invoiceId}`, html: shell(business, "Payment received", body) };
}

export function buildCustomerReminderEmail(invoice: Pick<JobInvoice, "invoiceId" | "billTo" | "dueAt">, balance: number, lateDays: number, business: PayBusiness, prefs: Pick<EffectiveBillingPrefs, "payInstructions" | "payLink">, timezone = "America/New_York") {
  const firm = lateDays >= 14;
  const due = invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: timezone }) : "";
  const body = `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">Hi ${escapeHtml(invoice.billTo.name || "there")}, invoice <b>${escapeHtml(invoice.invoiceId)}</b> has <b>${usd(balance)}</b> still due${due ? ` (it was due ${escapeHtml(due)})` : ""}.</p>
${howToPayBlock(prefs, balance, business.brandColor)}
<p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#475569">${firm ? "Please pay this week, or reply if something is wrong with the invoice." : "If you've already paid, thank you — please ignore this."}</p>`;
  return { subject: `${firm ? "[Final reminder]" : "[Reminder]"} Invoice ${invoice.invoiceId} from ${business.businessName}`, html: shell(business, firm ? "Payment overdue" : "A friendly reminder", body) };
}
