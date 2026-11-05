import { NextRequest } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { payNowAvailability } from "@/lib/billing/payNow";
import { payTokenHash, verifyPayToken } from "@/lib/billing/payNowToken";
import { getStripeClient, isStripeConfigured } from "@/lib/billing/stripePayments";
import { invoiceBalance } from "@/lib/billing/customerPayments";
import { escapeHtml, resolveLetterhead } from "@/lib/documents/letterhead";
import { getAppUrl } from "@/lib/config/appUrl";
import { fmtMoney } from "@/lib/format/money";
import type { BusinessConfig } from "@/types";
import type { JobInvoice } from "@/types/invoice";
import type { LibraryLogo } from "@/types/library";

// Public: the 256-bit bearer token is the credential. GET never starts Checkout.
const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };
const idShape = /^[A-Za-z0-9_-]{1,128}$/;
function page(title: string, body: string) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="font-family:Arial,sans-serif;margin:0;padding:24px 16px;background:#f1f5f9;color:#0f172a"><main style="max-width:480px;margin:32px auto;padding:24px;background:white;border:1px solid #cbd5e1;border-radius:12px;line-height:1.6"><h1 style="font-size:22px">${escapeHtml(title)}</h1>${body}</main></body></html>`, { headers });
}
const unavailable = (name = "the business") => page("Payment link unavailable", `<p>This payment link isn't available. Please contact ${escapeHtml(name)}.</p>`);
function parse(input: URLSearchParams | FormData) {
  const b = input.get("b"), i = input.get("i"), t = input.get("t");
  if (typeof b !== "string" || !idShape.test(b) || typeof i !== "string" || !idShape.test(i) || typeof t !== "string") return null;
  return { b, i, t };
}

async function linked(input: NonNullable<ReturnType<typeof parse>>) {
  const db = getAdminFirestore();
  if (!db) return { name: "the business" };
  const [biz, snap] = await Promise.all([db.collection("businesses").doc(input.b).get(), db.collection(`businesses/${input.b}/invoices`).doc(input.i).get()]);
  const business = biz.data() as BusinessConfig | undefined;
  const name = business?.businessName || "the business";
  const invoice = snap.data() as JobInvoice | undefined;
  if (!business || !invoice || invoice.businessId !== input.b || invoice.invoiceId !== input.i || !idShape.test(invoice.jobId)
    || !verifyPayToken(input.t, invoice) || !payNowAvailability({ ...business, stripeConfigured: isStripeConfigured() }, invoice)) return { name };
  const job = await db.collection(`businesses/${input.b}/jobs`).doc(invoice.jobId).get();
  if (!job.exists || (invoice.kind !== "deposit" && job.data()?.invoiceId !== input.i)) return { name };
  return { name, db, business, invoice };
}

export async function GET(req: NextRequest) {
  // Static courtesy pages make no claim that money has cleared (ACH may take days).
  if (req.nextUrl.searchParams.get("result") === "submitted") return page("Payment submitted", "<p>Thank you. The business will send a receipt when your payment clears. Bank payments can take several days.</p>");
  if (req.nextUrl.searchParams.get("result") === "cancelled") return page("Checkout closed", "<p>Use the payment link in your invoice to try again, or contact the business.</p>");
  const input = parse(req.nextUrl.searchParams);
  if (!input) return unavailable();
  try {
    const link = await linked(input);
    if (!link.invoice) return unavailable(link.name);
    const { business, invoice } = link;
    const logos = await link.db.collection(`businesses/${input.b}/library`).doc("logos").get();
    const logo = resolveLetterhead(business, (logos.data()?.logos as LibraryLogo[] | undefined) ?? [], "light", invoice.logoId).logoUrl;
    const safeLogo = logo && (/^https:\/\//i.test(logo) || /^data:image\/(png|jpeg|webp);base64,/i.test(logo)) ? `<img src="${escapeHtml(logo)}" alt="" style="max-width:180px;max-height:90px">` : "";
    const due = invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString("en-US", { timeZone: business.timezone || "America/New_York", year: "numeric", month: "long", day: "numeric" }) : "On receipt";
    const fields = Object.entries(input).map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`).join("");
    const buttonStyle = "display:block;width:100%;min-height:48px;padding:12px;margin-top:12px;border:1px solid #0f766e;border-radius:8px;font-size:16px;cursor:pointer";
    return page(link.name, `${safeLogo}<p>Invoice ${escapeHtml(invoice.invoiceId)}</p><p style="font-size:28px;font-weight:bold">${escapeHtml(fmtMoney(invoiceBalance(invoice)))} due</p><p>Due: ${escapeHtml(due)}</p><form method="post" action="/api/pay/invoice">${fields}<button type="submit" name="method" value="card" style="${buttonStyle};background:#0f766e;color:white">Pay by card</button><button type="submit" name="method" value="us_bank_account" style="${buttonStyle};background:white;color:#0f766e">Pay by bank (ACH)</button></form>`);
  } catch { return unavailable(); }
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => new FormData());
  const input = parse(form);
  if (!input) return unavailable();
  try {
    const link = await linked(input);
    if (!link.invoice) return unavailable(link.name);
    const method = form.get("method");
    // No amount, currency, account, URLs or metadata are accepted from the form.
    if ((method !== "card" && method !== "us_bank_account") || [...form.keys()].some(key => !["b", "i", "t", "method"].includes(key))) return unavailable(link.name);
    const { invoice, business } = link;
    const amount = Math.round(invoiceBalance(invoice) * 100);
    const metadata = { businessId: input.b, invoiceId: input.i, jobId: invoice.jobId, tokenHashPrefix: payTokenHash(input.t).slice(0, 8) };
    const session = await getStripeClient().checkout.sessions.create({ mode: "payment", payment_method_types: [method],
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: amount, product_data: { name: `Invoice ${invoice.invoiceId}` } } }],
      metadata, payment_intent_data: { metadata },
      success_url: `${getAppUrl()}/api/pay/invoice?result=submitted`, cancel_url: `${getAppUrl()}/api/pay/invoice?result=cancelled`,
    }, { stripeAccount: business.stripeConnect!.accountId, idempotencyKey: `invoice-${input.b}-${input.i}-${payTokenHash(input.t)}-${amount}-${method}-${Math.floor(Date.now() / 1800000)}` });
    if (!session.url || new URL(session.url).origin !== "https://checkout.stripe.com") return unavailable(link.name);
    // Token stays out of Stripe's success/cancel URLs and the Referrer header.
    return new Response(null, { status: 303, headers: { ...headers, Location: session.url } });
  } catch { return unavailable(); }
}
