import type Stripe from "stripe";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { BusinessConfig } from "@/types";
import type { InvoicePayment, JobInvoice } from "@/types/invoice";
import type { Job } from "@/types/jobs";
import { claimOperation } from "@/lib/ops/ledger";
import { applyPayment, applyStripeRefund, buildCustomerReceiptEmail, invoiceBalance } from "./customerPayments";
import { sendEmail } from "@/lib/comms/send";
import { deliverDocument, parseDocumentRecipients } from "@/lib/documents/recipients";
import { getStripeClient } from "./stripePayments";

const idShape = /^[A-Za-z0-9_-]{1,128}$/;
const ignored = (event: Stripe.Event) => { console.warn("stripe-connect ignored", event.id, event.account ?? "no-account"); };
const providerId = (value: string | { id: string } | null) => typeof value === "string" ? value : value?.id;

/** Event/account/tenant validation is repeated inside the transaction. Turning off future Pay now links
 * never prevents recording money that already moved. No customer or card data is logged. */
export async function handleConnectEvent(db: Firestore, event: Stripe.Event, defer?: (work: () => Promise<void>) => void): Promise<void> {
  if (!event.account || !idShape.test(event.id) || !idShape.test(event.account)) { ignored(event); return; }
  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const businessId = account.metadata?.businessId;
    if (!businessId || !idShape.test(businessId) || account.id !== event.account) { ignored(event); return; }
    const ref = db.collection("businesses").doc(businessId);
    if ((await ref.get()).data()?.stripeConnect?.accountId !== event.account) { ignored(event); return; }
    await claimOperation({ businessId, opId: `stripe:${event.id}`, kind: "stripe-connect" }, { firestore: db });
    const op = ref.collection("operations").doc(`stripe:${event.id}`);
    await db.runTransaction(async tx => {
      const business = (await tx.get(ref)).data(); const operation = (await tx.get(op)).data();
      if (operation?.state === "succeeded" || !business || business.stripeConnect?.accountId !== event.account) return;
      // Ignore older account events so they cannot revive stale capabilities.
      if ((business.stripeConnectEventCreated ?? 0) <= event.created) tx.update(ref, { stripeConnectEventCreated: event.created, stripeConnect: { accountId: account.id,
        chargesEnabled: account.charges_enabled === true, payoutsEnabled: account.payouts_enabled === true,
        detailsSubmitted: account.details_submitted === true, updatedAt: Date.now() } });
      tx.update(op, { state: "succeeded", completedAt: Timestamp.now(), updatedAt: Timestamp.now() });
    });
    return;
  }
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "charge.refunded"].includes(event.type)) return;
  const refund = event.type === "charge.refunded";
  const session = event.data.object as Stripe.Checkout.Session;
  const charge = event.data.object as Stripe.Charge;
  let metadata = refund ? charge.metadata : session.metadata;
  // Charge metadata isn't guaranteed to inherit PaymentIntent metadata. Retrieve on the DIRECT account only.
  if (refund && !metadata?.businessId) {
    const intentId = providerId(charge.payment_intent);
    if (!intentId || !idShape.test(intentId)) { ignored(event); return; }
    const intent = await getStripeClient().paymentIntents.retrieve(intentId, {}, { stripeAccount: event.account });
    metadata = intent.metadata;
  }
  const businessId = metadata?.businessId, invoiceId = metadata?.invoiceId, jobId = metadata?.jobId;
  if (![businessId, invoiceId, jobId].every(v => typeof v === "string" && idShape.test(v))) { ignored(event); return; }
  const bizRef = db.collection("businesses").doc(businessId!);
  const invRef = bizRef.collection("invoices").doc(invoiceId!);
  const jobRef = bizRef.collection("jobs").doc(jobId!);
  const [biz, inv] = await Promise.all([bizRef.get(), invRef.get()]);
  if (biz.data()?.stripeConnect?.accountId !== event.account || inv.data()?.businessId !== businessId || inv.data()?.invoiceId !== invoiceId || inv.data()?.jobId !== jobId) { ignored(event); return; }
  const intentId = providerId(refund ? charge.payment_intent : session.payment_intent);
  const paid = event.type === "checkout.session.async_payment_succeeded" || event.type === "checkout.session.completed" && session.payment_status === "paid";
  if ((paid || refund) && (!intentId || !idShape.test(intentId))) { ignored(event); return; }
  if (!refund && (session.mode !== "payment" || !idShape.test(session.id))) { ignored(event); return; }
  if ((paid && (session.currency !== "usd" || !Number.isSafeInteger(session.amount_total) || session.amount_total! <= 0))
    || refund && (charge.currency !== "usd" || !Number.isSafeInteger(charge.amount_refunded))) { ignored(event); return; }
  await claimOperation({ businessId: businessId!, opId: `stripe:${event.id}`, kind: "stripe-connect", entityRef: { collection: "invoices", id: invoiceId! } }, { firestore: db });
  const opRef = bizRef.collection("operations").doc(`stripe:${event.id}`);
  const stateRef = refund ? null : bizRef.collection("stripeCheckoutSessions").doc(session.id);
  const receipt = await db.runTransaction(async tx => {
    const business = (await tx.get(bizRef)).data() as BusinessConfig | undefined;
    const invoice = (await tx.get(invRef)).data() as JobInvoice | undefined;
    const job = (await tx.get(jobRef)).data() as Job | undefined;
    const op = (await tx.get(opRef)).data();
    const sessionState = stateRef ? (await tx.get(stateRef)).data() : null;
    if (op?.state === "succeeded") return null;
    if (!business || business.stripeConnect?.accountId !== event.account || !invoice || invoice.businessId !== businessId || invoice.invoiceId !== invoiceId || invoice.jobId !== jobId || !job) { ignored(event); return null; }
    const now = Date.now(), paymentId = `stripe_${intentId}`;
    let result: { invoice: JobInvoice; payment: InvoicePayment; business: BusinessConfig; job: Job } | null = null;
    let note: string | undefined;
    if (refund) {
      const changed = applyStripeRefund(invoice, paymentId, charge.amount_refunded / 100, event.created * 1000);
      if (changed) {
        tx.update(invRef, { ...changed, ...(changed.status !== "paid" ? { paidAt: FieldValue.delete() } : {}), updatedAt: now,
          payNowNotice: "An online payment was refunded. Review the invoice and job." });
        if (changed.status === "sent" && invoice.kind !== "deposit") tx.update(jobRef, { paymentReceivedAt: FieldValue.delete(),
          ...(job.status === "complete" ? { status: "invoiced", statusHistory: [...(job.statusHistory ?? []), { status: "invoiced", at: now, by: "stripe" }] } : {}), updatedAt: now });
        note = "refund-recorded";
      }
    } else if (paid) {
      if (!invoice.payments?.some(p => p.paymentId === paymentId)) {
        const payment: InvoicePayment = { paymentId, amount: session.amount_total! / 100, source: "stripe",
          method: session.payment_method_types?.includes("us_bank_account") ? "bank" : "card", receivedAt: event.created * 1000, recordedAt: now, recordedBy: "stripe", note: "Paid online" };
        const applied = applyPayment(invoice, payment);
        const { paidInFull: _paidInFull, ...fields } = applied;
        const status = invoice.status === "void" ? "void" : fields.status;
        const notice = payment.amount > invoiceBalance(invoice) ? "An online payment exceeds the balance. Review the overpayment."
          : invoice.status === "draft" || invoice.status === "void" ? "An online payment arrived for an unavailable invoice. Review it." : undefined;
        tx.update(invRef, { ...fields, status, updatedAt: now, ...(notice ? { payNowNotice: notice } : {}) });
        if (status === "paid" && invoice.kind !== "deposit") tx.update(jobRef, { status: "complete", completedAt: job.completedAt ?? now, paymentReceivedAt: fields.paidAt ?? now,
          updatedAt: now, statusHistory: [...(job.statusHistory ?? []), { status: "complete", at: now, by: "stripe" }] });
        result = { invoice: { ...invoice, ...fields, status, ...(notice ? { payNowNotice: notice } : {}) }, payment, business, job };
        note = notice ? "payment-office-review" : "payment-recorded";
      }
      if (invoice.payNowPending?.sessionId === session.id) tx.update(invRef, { payNowPending: FieldValue.delete() });
      tx.set(stateRef!, { state: "paid", updatedAt: now });
    } else if (event.type === "checkout.session.async_payment_failed") {
      if (sessionState?.state !== "paid") {
        if (invoice.payNowPending?.sessionId === session.id) tx.update(invRef, { payNowPending: FieldValue.delete(), payNowNotice: "A bank payment failed. Contact the customer to arrange payment." });
        tx.set(stateRef!, { state: "failed", updatedAt: now });
        note = "ach-failed";
      }
    } else if (session.payment_status === "unpaid" && session.payment_method_types?.includes("us_bank_account") && !sessionState && !invoice.payments?.some(p => p.paymentId === paymentId)) {
      tx.update(invRef, { payNowPending: { sessionId: session.id, at: event.created * 1000 }, updatedAt: now });
      tx.set(stateRef!, { state: "pending", updatedAt: now });
      note = "ach-pending";
    }
    tx.update(opRef, { state: "succeeded", completedAt: Timestamp.now(), updatedAt: Timestamp.now(), ...(note ? { note } : {}) });
    return result;
  });
  if (!receipt) return;
  // Same receipt builder and guarded sendEmail path as staff payments. A failed courtesy email cannot undo money.
  const recipients = parseDocumentRecipients(receipt.job.documentRecipients ?? receipt.invoice.sentTo ?? receipt.invoice.billTo.email ?? "");
  if ("error" in recipients) return;
  const business = { ...receipt.business, businessName: receipt.business.businessName || "Your service provider" };
  const email = buildCustomerReceiptEmail(receipt.invoice, receipt.payment, invoiceBalance(receipt.invoice), business, business.timezone);
  const receiptFailed = async () => {
    // Preserve an overpayment/refund warning if the courtesy email also fails.
    await db.runTransaction(async tx => {
      const current = (await tx.get(invRef)).data();
      const message = "Payment recorded. The receipt email could not be delivered.";
      const previous = typeof current?.payNowNotice === "string" ? current.payNowNotice : "";
      if (!previous.includes(message)) tx.update(invRef, { payNowNotice: [previous, message].filter(Boolean).join(" ") });
    }).catch(() => { console.error("stripe-connect receipt notice failed", event.id); });
  };
  const deliverReceipt = async () => {
    try {
      const delivery = await deliverDocument(recipients.recipients, to => sendEmail({ businessId: businessId!, to, ...email, fromName: business.businessName, replyTo: business.contactEmail || business.notificationEmail }));
      if (delivery.failed.length) await receiptFailed();
    } catch { await receiptFailed(); }
  };
  // Next's after() keeps provider email latency out of Stripe's acknowledgement and keeps the task alive.
  if (defer) defer(deliverReceipt);
  else await deliverReceipt();
}
