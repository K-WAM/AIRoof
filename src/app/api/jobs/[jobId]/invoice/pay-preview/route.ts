// A read-only preview of the customer's Pay now page (owner 2026-11-05: "Pay now, just as a read-only view, for both
// companies"). Signed-in staff and the platform admin see the page a customer gets after tapping Pay now, under the
// invoice's own company letterhead (RDSF or RCU) — but the buttons are switched off: no form, no pay token, no Stripe
// call, nothing is written. The real page is the token-gated /api/pay/invoice. GET only, so View as can open it.

import { NextRequest } from "next/server";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { payNowAvailability } from "@/lib/billing/payNow";
import { isStripeConfigured } from "@/lib/billing/stripePayments";
import { invoiceBalance } from "@/lib/billing/customerPayments";
import { loadDocumentCompany } from "@/lib/companies/documentCompany";
import { documentLetterhead } from "@/lib/companies/documentLetterhead";
import { letterheadBlock } from "@/lib/documents/emailBlocks";
import { escapeHtml } from "@/lib/documents/letterhead";
import { fmtMoney } from "@/lib/format/money";
import type { BusinessConfig } from "@/types";
import type { JobInvoice } from "@/types/invoice";
import type { LibraryLogo } from "@/types/library";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };

function page(title: string, body: string, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head><body style="font-family:Arial,sans-serif;margin:0;padding:24px 16px;background:#f1f5f9;color:#0f172a"><main style="max-width:480px;margin:32px auto;padding:24px;background:white;border:1px solid #cbd5e1;border-radius:12px;line-height:1.6">${body}</main></body></html>`, { status, headers });
}
const notFound = () => page("Preview unavailable", "<h1 style=\"font-size:22px\">Preview unavailable</h1><p>This invoice could not be found. Create the invoice first, then open the preview again.</p>", 404);

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const businessId = req.nextUrl.searchParams.get("businessId") ?? "";
  if (!ID.test(businessId) || !ID.test(jobId)) return notFound();
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "viewer", "superadmin"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return page("Preview unavailable", "<p>Database unavailable. Try again in a moment.</p>", 503);

  const [bizSnap, jobSnap] = await Promise.all([db.collection("businesses").doc(businessId).get(), db.collection(`businesses/${businessId}/jobs`).doc(jobId).get()]);
  const business = bizSnap.data() as BusinessConfig | undefined;
  const job = jobSnap.data() as { invoiceId?: string; companyId?: string; customerId?: string } | undefined;
  const invoiceId = req.nextUrl.searchParams.get("invoiceId") || job?.invoiceId || "";
  if (!business || !job || !ID.test(invoiceId)) return notFound();
  const [invSnap, logosSnap] = await Promise.all([db.collection(`businesses/${businessId}/invoices`).doc(invoiceId).get(), db.collection(`businesses/${businessId}/library`).doc("logos").get()]);
  const invoice = invSnap.data() as JobInvoice | undefined;
  if (!invoice || invoice.jobId !== jobId) return notFound();

  const company = await loadDocumentCompany(db, businessId, business, invoice, job);
  const brand = documentLetterhead(business, company, (logosSnap.data()?.logos as LibraryLogo[] | undefined) ?? [], invoice.logoId);
  const companyName = company?.name || business.businessName || "your business";
  const live = payNowAvailability({ ...business, stripeConfigured: isStripeConfigured() }, { ...invoice, ...(company ? { companyId: company.id } : {}) }, { jobCompanyId: job.companyId });
  const due = invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString("en-US", { timeZone: business.timezone || "America/New_York", year: "numeric", month: "long", day: "numeric" }) : "On receipt";
  const balance = invoiceBalance(invoice);
  const paid = invoice.status === "paid" || balance <= 0;
  const banner = `<p role="note" style="margin:0 0 16px;padding:10px 12px;border:1px solid #f59e0b;background:#fffbeb;border-radius:8px;font-size:14px"><strong>Preview only.</strong> This is the page your customer sees after tapping Pay now. The buttons are switched off here; no payment can be made. ${live
    ? "Online payments are on for this invoice — the customer's own link works."
    : invoice.status === "draft"
      ? "Pay now is added to the invoice email when it is sent, once online payments are switched on."
      : `Online payments are not switched on for ${escapeHtml(companyName)} yet.`}</p>`;
  const button = "display:block;width:100%;min-height:48px;padding:12px;margin-top:12px;border:1px solid #0f766e;border-radius:8px;font-size:16px;opacity:.55;cursor:not-allowed";
  const actions = paid
    ? "<p style=\"font-size:18px;font-weight:bold\">Paid in full — nothing to pay.</p>"
    : `<button type="button" disabled aria-disabled="true" style="${button};background:#0f766e;color:white">Pay by card</button><button type="button" disabled aria-disabled="true" style="${button};background:white;color:#0f766e">Pay by bank (ACH)</button>`;
  return page(`Pay invoice — preview`, `${banner}${letterheadBlock(brand, "", [])}<p>Invoice ${escapeHtml(invoice.invoiceId)}${invoice.status === "draft" ? " (draft — not sent yet)" : ""}</p><p style="font-size:28px;font-weight:bold">${escapeHtml(fmtMoney(Math.max(0, balance)))} due</p><p>Due: ${escapeHtml(due)}</p>${actions}`);
}
