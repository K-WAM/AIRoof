import { documentLetterhead } from "@/lib/companies/documentLetterhead";
import { loadDocumentCompany } from "@/lib/companies/documentCompany";
import { letterheadBlock } from "@/lib/documents/emailBlocks";
import { createHash, randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { payNowAvailability } from "@/lib/billing/payNow";
import { verifyPayToken } from "@/lib/billing/payNowToken";
import { getStripeClient, isStripeConfigured } from "@/lib/billing/stripePayments";
import { invoiceBalance } from "@/lib/billing/customerPayments";
import { escapeHtml } from "@/lib/documents/letterhead";
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
const unavailable = () => page("Payment link unavailable", "<p>This payment link isn't available. Please contact the business that sent you this invoice.</p>");
const processing = () => page("Payment processing", "<p>A bank payment for this invoice is being processed. It usually clears in a few business days.</p>");
const activePending = (invoice: JobInvoice) => !!invoice.payNowPending && Date.now() - invoice.payNowPending.at <= 10 * 24 * 60 * 60 * 1000;
const checkoutUrl = (url: string | null) => !!url && new URL(url).origin === "https://checkout.stripe.com";
const redirect = (url: string) => new Response(null, { status: 303, headers: { ...headers, Location: url } });
function resume(url: string, startedMethod: "card" | "us_bank_account", requestedMethod: string) {
  if (requestedMethod === startedMethod) return redirect(url);
  return page("Finish your payment", `<p>A payment was already started — finish it here.</p><p><a href="${escapeHtml(url)}">Pay by ${startedMethod === "us_bank_account" ? "bank (ACH)" : "card"}</a></p>`);
}
const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");
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
    || !verifyPayToken(input.t, input.b, input.i, invoice) || !payNowAvailability({ ...business, stripeConfigured: isStripeConfigured() }, invoice)) return { name };
  const job = await db.collection(`businesses/${input.b}/jobs`).doc(invoice.jobId).get();
  if (!job.exists || (invoice.kind !== "deposit" && job.data()?.invoiceId !== input.i)) return { name };
  const company = await loadDocumentCompany(db, input.b, business, invoice, job.data() ?? {});
  if (!payNowAvailability({ ...business, stripeConfigured: isStripeConfigured() }, { ...invoice, ...(company ? { companyId: company.id } : {}) })) return { name };
  return { name: company?.name || name, db, business, invoice, company };
}

export async function GET(req: NextRequest) {
  // Static courtesy pages make no claim that money has cleared (ACH may take days).
  if (req.nextUrl.searchParams.get("result") === "submitted") return page("Payment submitted", "<p>Thank you. The business will send a receipt when your payment clears. Bank payments can take several days.</p>");
  if (req.nextUrl.searchParams.get("result") === "cancelled") return page("Checkout closed", "<p>Use the payment link in your invoice to try again, or contact the business.</p>");
  const input = parse(req.nextUrl.searchParams);
  if (!input) return unavailable();
  try {
    const link = await linked(input);
    if (!link.invoice) return unavailable();
    const { business, invoice } = link;
    if (activePending(invoice)) return processing();
    const logos = await link.db.collection(`businesses/${input.b}/library`).doc("logos").get();
    const brand = documentLetterhead(business, link.company, (logos.data()?.logos as LibraryLogo[] | undefined) ?? [], invoice.logoId);
    const logo = brand.logoUrl;
    const safeLogo = logo && (/^https:\/\//i.test(logo) || /^data:image\/(png|jpeg|webp);base64,/i.test(logo)) ? `<img src="${escapeHtml(logo)}" alt="" style="max-width:180px;max-height:90px">` : "";
    const due = invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString("en-US", { timeZone: business.timezone || "America/New_York", year: "numeric", month: "long", day: "numeric" }) : "On receipt";
    const fields = Object.entries(input).map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`).join("");
    const buttonStyle = "display:block;width:100%;min-height:48px;padding:12px;margin-top:12px;border:1px solid #0f766e;border-radius:8px;font-size:16px;cursor:pointer";
    // The letterhead already prints the company's identity; the page heading must not print it a second time.
    return page(link.company ? "Pay invoice" : link.name, `${link.company ? letterheadBlock(brand, "", []) : safeLogo}<p>Invoice ${escapeHtml(invoice.invoiceId)}</p><p style="font-size:28px;font-weight:bold">${escapeHtml(fmtMoney(invoiceBalance(invoice)))} due</p><p>Due: ${escapeHtml(due)}</p><form method="post" action="/api/pay/invoice">${fields}<button type="submit" name="method" value="card" style="${buttonStyle};background:#0f766e;color:white">Pay by card</button><button type="submit" name="method" value="us_bank_account" style="${buttonStyle};background:white;color:#0f766e">Pay by bank (ACH)</button></form>`);
  } catch { return unavailable(); }
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => new FormData());
  const input = parse(form);
  if (!input) return unavailable();
  try {
    const link = await linked(input);
    if (!link.invoice) return unavailable();
    const method = form.get("method");
    // No amount, currency, account, URLs or metadata are accepted from the form.
    if ((method !== "card" && method !== "us_bank_account") || [...form.keys()].some(key => !["b", "i", "t", "method"].includes(key))) return unavailable();
    const { invoice, business } = link;
    if (activePending(invoice)) return processing();
    const stripe = getStripeClient();
    const account = { stripeAccount: business.stripeConnect!.accountId };
    const previous = invoice.payNowCheckout;
    let expiredSessionId: string | undefined;
    if (previous && !invoice.payNowPending) {
      const existing = await stripe.checkout.sessions.retrieve(previous.sessionId, {}, account).catch(() => null);
      if (existing?.status === "complete") return processing();
      // Resume only a session for exactly what is owed now, on the current link. Anything else (a payment was recorded
      // since, or the office sent a new link) is closed at Stripe first, so two payable sessions never exist at once.
      const owedNow = Math.round(invoiceBalance(invoice) * 100);
      const sameTerms = previous.amount === owedNow && previous.payLinkNonce === invoice.payLinkNonce;
      if (existing?.status === "open" && sameTerms && checkoutUrl(existing.url)) {
        return resume(existing.url!, previous.method, method);
      }
      if (existing?.status === "open") {
        const closed = await stripe.checkout.sessions.expire(previous.sessionId, {}, account).catch(() => null);
        if (!closed) {
          // It may have completed in the meantime; never open a second session while that is unknown.
          const again = await stripe.checkout.sessions.retrieve(previous.sessionId, {}, account).catch(() => null);
          return again?.status === "complete" ? processing() : unavailable();
        }
        expiredSessionId = previous.sessionId;
      }
      if (existing?.status === "expired") expiredSessionId = previous.sessionId;
    }
    const invoiceRef = link.db.collection(`businesses/${input.b}/invoices`).doc(input.i);
    // Reserve a nonce and method before Stripe so concurrent requests use identical parameters.
    // A terminal attempt gets a fresh nonce; method changes and clock ticks never rotate it.
    const attempt = await link.db.runTransaction(async tx => {
      const current = (await tx.get(invoiceRef)).data() as JobInvoice | undefined;
      if (!current || current.businessId !== input.b || current.invoiceId !== input.i || current.jobId !== invoice.jobId
        || !verifyPayToken(input.t, input.b, input.i, current)
        || !payNowAvailability({ ...business, stripeConfigured: isStripeConfigured() }, current)) return null;
      if (activePending(current)) return "pending";
      const stalePending = !!current.payNowPending;
      const expired = !!expiredSessionId && current.payNowCheckout?.sessionId === expiredSessionId;
      const currentAmount = Math.round(invoiceBalance(current) * 100);
      const saved = current.payNowCheckoutAttempt;
      if (saved && saved.amount === currentAmount && saved.payLinkNonce === current.payLinkNonce && !expired && !stalePending) return saved;
      const next = { nonce: randomBytes(16).toString("hex"), method: (method === "card" ? "card" : "us_bank_account") as "card" | "us_bank_account", amount: currentAmount, payLinkNonce: current.payLinkNonce! };
      tx.update(invoiceRef, { payNowCheckoutAttempt: next,
        ...(stalePending ? { payNowPending: FieldValue.delete() } : {}),
        ...(stalePending || expired ? { payNowCheckout: FieldValue.delete() } : {}),
      });
      return next;
    });
    if (!attempt) return unavailable();
    if (attempt === "pending") return processing();
    const metadata = { businessId: input.b, invoiceId: input.i, jobId: invoice.jobId, tokenHashPrefix: tokenDigest(input.t).slice(0, 8) };
    const session = await stripe.checkout.sessions.create({ mode: "payment", payment_method_types: [attempt.method],
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: attempt.amount, product_data: { name: `Invoice ${invoice.invoiceId}` } } }],
      metadata, payment_intent_data: { metadata },
      success_url: `${getAppUrl()}/api/pay/invoice?result=submitted`, cancel_url: `${getAppUrl()}/api/pay/invoice?result=cancelled`,
    }, { ...account, idempotencyKey: `invoice-${input.b}-${input.i}-${attempt.nonce}-${attempt.amount}` });
    if (session.status === "complete") return processing();
    if (!checkoutUrl(session.url)) return unavailable();
    await link.db.runTransaction(async tx => {
      const current = (await tx.get(invoiceRef)).data() as JobInvoice | undefined;
      const terminal = (await tx.get(link.db.collection(`businesses/${input.b}/stripeCheckoutSessions`).doc(session.id))).data();
      if (current?.payNowCheckoutAttempt?.nonce !== attempt.nonce) return;
      // A fast webhook must not have its cleared markers restored by this write.
      if (terminal?.state === "paid" || terminal?.state === "failed") {
        tx.update(invoiceRef, { payNowCheckoutAttempt: FieldValue.delete() });
        return;
      }
      tx.update(invoiceRef, { payNowCheckout: { sessionId: session.id, method: attempt.method, amount: attempt.amount, payLinkNonce: attempt.payLinkNonce,
        createdAt: current.payNowCheckout?.sessionId === session.id ? current.payNowCheckout.createdAt : Date.now() } });
    });
    // Token stays out of Stripe's success/cancel URLs and the Referrer header.
    return resume(session.url!, attempt.method, method);
  } catch { return unavailable(); }
}
