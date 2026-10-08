import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { sendEmail } from "@/lib/comms/send";
import { applyPayment, buildCustomerReceiptEmail, invoiceBalance, MAX_PAYMENTS_PER_INVOICE, parsePayment } from "@/lib/billing/customerPayments";
import type { InvoicePayment, JobInvoice } from "@/types/invoice";

// POST /api/jobs/[jobId]/invoice/payments  body: { businessId, amount, method, receivedAt?, note?, sendReceipt? }
// "Record payment" (Billing product, no Stripe): the office logs money the customer paid them directly. Partial
// payments add up; the last one that covers the total marks the invoice Paid. The customer gets a receipt email when
// the invoice has their email (sendReceipt: false skips it). Owner/staff only; the Billing product is enforced by the
// central guard (src/lib/products). One transaction, so two people recording at once can't overpay the invoice.

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const businessId = typeof body.businessId === "string" ? body.businessId : "";
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const jobSnap = await db.collection(`businesses/${businessId}/jobs`).doc(jobId).get();
  const invoiceId = jobSnap.data()?.invoiceId;
  if (!invoiceId) return NextResponse.json({ error: "This job has no invoice yet" }, { status: 404 });
  const invRef = db.collection(`businesses/${businessId}/invoices`).doc(invoiceId);
  const now = Date.now();

  let result: { invoice: JobInvoice; payment: InvoicePayment; balance: number };
  try {
    result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(invRef);
      if (!snap.exists) throw new HttpError(404, "Invoice not found");
      const invoice = snap.data() as JobInvoice;
      if (invoice.status === "draft") throw new HttpError(409, "Send the invoice before recording a payment.");
      if (invoice.status === "void") throw new HttpError(409, "This invoice was voided.");
      const balance = invoiceBalance(invoice);
      if (balance <= 0) throw new HttpError(409, "This invoice is already paid in full.");
      if ((invoice.payments?.length ?? 0) >= MAX_PAYMENTS_PER_INVOICE) throw new HttpError(409, "Too many payments on one invoice.");
      const parsed = parsePayment(body, balance, now);
      if ("error" in parsed) throw new HttpError(400, parsed.error);
      const payment: InvoicePayment = { paymentId: `pay_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`, ...parsed.payment, recordedBy: gate.user.uid, recordedAt: now };
      const { payments, amountPaid, status, paidAt } = applyPayment(invoice, payment);
      const applied = { payments, amountPaid, status, ...(paidAt ? { paidAt } : {}) };
      tx.update(invRef, { ...applied, updatedAt: now });
      const next = { ...invoice, invoiceId: snap.id, ...applied, updatedAt: now };
      return { invoice: next, payment, balance: invoiceBalance(next) };
    });
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Record payment failed:", error);
    return NextResponse.json({ error: "The payment could not be saved. Nothing was recorded — try again." }, { status: 500 });
  }

  // The receipt is a courtesy: a failed email never undoes a recorded payment, it just says so.
  let receipt: "sent" | "skipped" | "failed" = "skipped";
  const to = (result.invoice.sentTo || result.invoice.billTo.email || "").trim();
  if (to && body.sendReceipt !== false) {
    const biz = (await db.collection("businesses").doc(businessId).get()).data() ?? {};
    const business = { businessName: String(biz.businessName || "Your service provider"), brandColor: biz.brandColor, contactPhone: biz.contactPhone, contactEmail: biz.contactEmail };
    const email = buildCustomerReceiptEmail(result.invoice, result.payment, result.balance, business, biz.timezone);
    const sent = await sendEmail({ to, ...email, fromName: business.businessName, replyTo: biz.contactEmail || biz.notificationEmail });
    receipt = sent.status === "delivered" ? "sent" : "failed";
  }

  return NextResponse.json({ invoice: { ...result.invoice, invoiceId }, balance: result.balance, receipt });
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
