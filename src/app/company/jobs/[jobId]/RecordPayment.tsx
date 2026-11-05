"use client";

import { track } from "@/lib/analytics/client";

// The invoice's money panel: what's been paid (including Stripe), what's still owed, and "Record payment" —
// the office logs money the customer paid them directly (cash, check, Zelle, their own card reader…). Partial payments
// add up; the payment that covers the total marks the invoice Paid. The customer gets an emailed receipt.
// Self-contained: it reads the saved invoice itself, so the (very large) job page only tells it when to show.

import { useEffect, useState } from "react";
import { NumberField } from "@/components/ui/NumberField";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, invoiceBalance, type PaymentMethod } from "@/lib/billing/customerPayments";
import type { JobInvoice } from "@/types/invoice";
import { useFormat } from "@/hooks/useFormat";
import { fmtMoney } from "@/lib/format/money";
import { parseDocumentRecipients } from "@/lib/documents/recipients";

const usd = (n: number) => fmtMoney(n);
const todayInput = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function RecordPayment({ businessId, jobId, readOnly, refreshKey, onPaid, recipients }: {
  recipients?: string[];
  businessId: string;
  jobId: string;
  readOnly: boolean;
  /** Changes when the invoice is (re)sent, so the panel re-reads it. */
  refreshKey?: unknown;
  onPaid: (paidAt: number) => void;
}) {
  const fmt = useFormat();
  const [invoice, setInvoice] = useState<JobInvoice | null>(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [method, setMethod] = useState<PaymentMethod>("check");
  const [date, setDate] = useState(todayInput());
  const [note, setNote] = useState("");
  const [sendReceipt, setSendReceipt] = useState(true);
  const [receiptEmails, setReceiptEmails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/jobs/${encodeURIComponent(jobId)}/invoice?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { invoice?: JobInvoice | null } | null) => { if (live && d?.invoice) setInvoice(d.invoice); })
      .catch(() => {});
    return () => { live = false; };
  }, [businessId, jobId, refreshKey]);

  if (!invoice || invoice.status === "draft" || invoice.status === "void") return null;
  const balance = invoiceBalance(invoice);
  const payments = invoice.payments ?? [];
  const receiptTo = recipients?.join(", ") || invoice.sentTo || invoice.billTo.email || "";

  function startRecording() {
    setReceiptEmails(receiptTo);
    setSendReceipt(!!receiptTo);
    setAmount(balance);
    setMethod("check");
    setDate(todayInput());
    setNote("");
    setError(null);
    setDone(null);
    setOpen(true);
  }

  async function submit() {
    const parsedRecipients = sendReceipt ? parseDocumentRecipients(receiptEmails) : undefined;
    if (parsedRecipients && "error" in parsedRecipients) { setError(parsedRecipients.error); return; }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { setError("Enter the amount received."); return; }
    if (value > balance + 0.001) { setError(`That's more than the ${usd(balance)} still owed.`); return; }
    // The picked day at noon local time: never "tomorrow" in another timezone, never in the future.
    const receivedAt = Math.min(Date.now(), new Date(`${date}T12:00:00`).getTime() || Date.now());
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/invoice/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, amount: value, method, receivedAt, note: note.trim() || undefined, sendReceipt, ...(parsedRecipients && "recipients" in parsedRecipients ? { to: parsedRecipients.recipients } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "The payment could not be saved."); return; }
      track("payment_recorded", { job_id: jobId, count: 1 });
      const next = data.invoice as JobInvoice;
      setInvoice(next);
      setOpen(false);
      const receiptLine = data.receipt === "sent" ? ` Receipt emailed to ${parsedRecipients && "recipients" in parsedRecipients ? parsedRecipients.recipients.join(", ") : receiptTo}.` : data.receipt === "failed" ? ` Payment saved. ${data.warning || "The receipt could not be delivered."}` : "";
      setDone(`${usd(value)} recorded.${data.balance > 0 ? ` ${usd(data.balance)} still owed.` : " Paid in full."}${receiptLine}`);
      if (next.status === "paid") onPaid(next.paidAt ?? Date.now());
    } catch {
      setError("The payment could not be saved. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel no-print" data-testid="invoice-payments" style={{ marginBottom: 16 }}>
      <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 className="panel-title" style={{ margin: 0 }}>
          {balance > 0 ? <>Balance due <strong data-testid="invoice-balance">{usd(balance)}</strong></> : <>Paid in full</>}
          <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 13 }}> · of {usd(invoice.total)}</span>
        </h3>
        {balance > 0 && !readOnly && !open && (
          <button type="button" className="button primary" onClick={startRecording} data-testid="record-payment">Record payment</button>
        )}
      </div>
      <div className="panel-body">
        {invoice.payNowPending && <p role="status">Bank payment pending</p>}
        {invoice.payNowNotice && <p role="status">{invoice.payNowNotice}</p>}
        {open && (
          <div className="form-grid" data-testid="record-payment-form" style={{ marginBottom: 12 }}>
            <div className="field">
              <label>Amount received ($)</label>
              <NumberField label="Amount received" value={amount} onCommit={setAmount} min={0} max={balance} />
            </div>
            <div className="field">
              <label htmlFor="pay-method">Paid by</label>
              <select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pay-date">Date received</label>
              <input id="pay-date" type="date" value={date} max={todayInput()} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pay-note">Note (optional)</label>
              <input id="pay-note" maxLength={200} value={note} placeholder="Check #1042" onChange={(e) => setNote(e.target.value)} />
            </div>
            {(
              <label className="check-row full">
                <input type="checkbox" checked={sendReceipt} onChange={(e) => setSendReceipt(e.target.checked)} />
                <span>Email a receipt</span>
              </label>
            )}
            {sendReceipt && <label className="field full">Receipt recipient emails<textarea rows={Math.min(10, Math.max(2, receiptEmails.split(",").length * 2))} aria-label="Receipt recipient emails" inputMode="email" value={receiptEmails} onChange={e => setReceiptEmails(e.target.value)} placeholder="Emails, separated by commas (up to 5)" /></label>}
            <div className="button-row full" style={{ marginTop: 0 }}>
              <button type="button" className="button primary" disabled={busy} onClick={() => void submit()}>{busy ? "Saving…" : "Save payment"}</button>
              <button type="button" className="button ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        )}
        {error && <p role="alert" style={{ margin: "0 0 10px", color: "#b91c1c", fontSize: 13 }}>{error}</p>}
        {done && <p role="status" style={{ margin: "0 0 10px", color: "#15803d", fontSize: 13 }}>{done}</p>}
        {payments.length === 0 ? (
          !open && <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>{balance > 0
            ? "No payments recorded yet. When the customer pays you, record it here — they get a receipt."
            : `Marked paid${invoice.paidAt ? ` on ${fmt.fmtDay(invoice.paidAt)}` : ""}.`}</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 13 }}>
            {payments.map((p) => (
              <li key={p.paymentId} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderTop: "1px solid var(--border)" }}>
                <span>{fmt.fmtDay(p.receivedAt)} · {p.source === "stripe" ? p.amount < 0 ? "Refunded online" : "Paid online" : PAYMENT_METHOD_LABEL[p.method as PaymentMethod] ?? "Other"}{p.note && p.source !== "stripe" ? ` · ${p.note}` : ""}</span>
                <strong>{usd(p.amount)}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
