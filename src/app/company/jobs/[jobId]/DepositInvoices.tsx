"use client";
import { useEffect, useState } from "react";
import type { JobInvoice } from "@/types/invoice";
import type { JobQuote } from "@/types/quote";
import type { Letterhead } from "@/lib/documents/letterhead";
import { DocumentPreview } from "@/lib/documents/DocumentPreview";
import { invoiceGroups } from "@/lib/documents/groups";
import { fmtMoney } from "@/lib/format/money";
import { invoiceBalance } from "@/lib/billing/customerPayments";
import { parseDocumentRecipients } from "@/lib/documents/recipients";
import { InvoicePayPrint, type SentPayLink } from "./InvoicePayPrint";

export function DepositInvoices({ jobId, businessId, quote, brand, email, readOnly, disabled, onChanged }: { jobId: string; businessId: string; quote: JobQuote | null; brand: Letterhead; email: string; readOnly: boolean; disabled: boolean; onChanged: () => Promise<void> }) {
  const [deposits, setDeposits] = useState<JobInvoice[]>([]);
  const [requesting, setRequesting] = useState(false);
  const [percent, setPercent] = useState("50");
  const [basis, setBasis] = useState("");
  const [selected, setSelected] = useState<JobInvoice | null>(null);
  const [to, setTo] = useState(email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");
  const [all, setAll] = useState(false);
  const [payLinks, setPayLinks] = useState<Record<string, SentPayLink | null>>({});
  const [newPayLink, setNewPayLink] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("check");
  async function load() {
    const r = await fetch(`/api/jobs/${jobId}/invoice/deposits`);
    if (!r.ok) throw new Error("Could not load deposits");
    setDeposits((await r.json()).deposits);
  }
  useEffect(() => { void load().catch(e => setError(e.message)); /* each job mounts its own panel */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);
  async function action(path: string, method: string, body: object) {
    const recipients = path === "/send" || path === "/payments" ? parseDocumentRecipients(to) : undefined;
    if (recipients && "error" in recipients) { setError(recipients.error); return null; }
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/jobs/${jobId}/invoice${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, ...(recipients && "recipients" in recipients ? { to: recipients.recipients } : {}) }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Could not save deposit");
      if (path === "/send" && selected) { setPayLinks(current => ({ ...current, [selected.invoiceId]: d.payNow ?? null })); setNewPayLink(false); }
      await load(); await onChanged(); return d;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save deposit"); return null; }
    finally { setBusy(false); }
  }
  return <><section className="no-print" aria-label="Deposit invoices" style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 16 }}>
    <details><summary>Deposits{deposits.length ? ` (${deposits.length})` : ""}</summary>
      {!readOnly && !requesting && <button className="button" disabled={busy || disabled} onClick={() => { setRequestId(crypto.randomUUID()); setRequesting(true); setSelected(null); }}>Request a deposit</button>}
      {requesting && <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        <label>Deposit percent<input aria-label="Deposit percent" type="number" min={1} max={100} step="0.01" value={percent} onChange={e => setPercent(e.target.value)} /></label>
        {quote?.status === "accepted" ? <p>Based on accepted quote {quote.quoteId}: {fmtMoney(quote.total)}.</p> : <label>Contract amount<input aria-label="Deposit contract amount" type="number" min="0.01" step="0.01" value={basis} onChange={e => setBasis(e.target.value)} /></label>}
        <div><button className="button" disabled={busy || disabled || !percent || Number(percent) < 1 || Number(percent) > 100} onClick={async () => { const d = await action("/deposits", "POST", { requestId, percent: Number(percent), ...(quote?.status === "accepted" ? {} : { basis: Number(basis) }) }); if (d) { setSelected(d.invoice); setRequesting(false); } }}>Create deposit draft</button><button className="button" disabled={busy} onClick={() => setRequesting(false)}>Cancel</button></div>
      </div>}
      <ul style={{ listStyle: "none", padding: 0 }}>{(all ? deposits : deposits.slice(0, 5)).map(d => <li key={d.invoiceId} style={{ borderTop: "1px solid var(--border)", padding: "10px 0" }}><strong>{d.invoiceId}</strong> · {fmtMoney(d.total)} · {d.status}<button className="button" onClick={() => { setSelected(d); setRequesting(false); setNewPayLink(false); }}>Review deposit</button></li>)}</ul>
      {deposits.length > 5 && <button className="button" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${deposits.length}`}</button>}
      {selected && <div style={{ marginTop: 14 }}><button className="button" onClick={() => { document.body.classList.add("k1-print-deposit"); window.addEventListener("afterprint", () => document.body.classList.remove("k1-print-deposit"), { once: true }); requestAnimationFrame(() => window.print()); }}>Print deposit</button><DocumentPreview title="Deposit invoice" brand={brand} meta={[["Number", selected.invoiceId], ["Work order", jobId]]} billTo={selected.billTo} serviceAt={selected.serviceAt} opening={selected.opening} groups={invoiceGroups(selected)} totalLabel="Deposit due" total={selected.total} />
        {selected.payNowPending && <p role="status">Bank payment pending</p>}
        {selected.payNowNotice && <p role="status">{selected.payNowNotice}</p>}
        {selected.payments?.some(p => p.source === "stripe" && p.amount > 0) && <p>Paid online</p>}
        {!readOnly && selected.status !== "void" && <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <label>Deposit recipient emails<textarea rows={2} aria-label="Deposit recipient emails" inputMode="email" value={to} onChange={e => setTo(e.target.value)} placeholder="Emails, separated by commas (up to 5)" /></label>
          <label><input type="checkbox" checked={newPayLink} disabled={busy} onChange={e => setNewPayLink(e.target.checked)} /> New payment link (turns off earlier links)</label>
          <button className="button" disabled={busy || disabled || !to.trim()} onClick={async () => { const d = await action("/send", "POST", { businessId, invoiceId: selected.invoiceId, to, newLink: newPayLink }); if (d) setSelected({ ...selected, status: selected.status === "paid" ? "paid" : "sent" }); }}>{selected.status === "draft" ? "Send deposit" : "Send deposit again"}</button>
          {(selected.status === "sent" || selected.status === "paid") && <p>Deposit balance: {fmtMoney(invoiceBalance(selected))}.</p>}
          {selected.status === "sent" && invoiceBalance(selected) > 0 && <details><summary>Record deposit payment</summary><label>Amount received<input aria-label="Deposit payment amount" type="number" min="0.01" step="0.01" max={invoiceBalance(selected)} value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} /></label><label>Payment method<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option value="check">Check</option><option value="bank">Bank transfer</option><option value="cash">Cash</option><option value="other">Other</option></select></label><button className="button" disabled={busy || disabled || !paymentAmount} onClick={async () => { const d = await action("/payments", "POST", { businessId, invoiceId: selected.invoiceId, amount: Number(paymentAmount), method: paymentMethod }); if (d) { setSelected(d.invoice); setPaymentAmount(""); if (d.receipt === "failed") setError("Payment saved; the receipt could not be sent."); } }}>Save deposit payment and email receipt</button></details>}
          {selected.status !== "paid" && !(selected.amountPaid && selected.amountPaid > 0) && <button className="button" disabled={busy || disabled} onClick={async () => { if (!confirm(`Void deposit ${selected.invoiceId}?`)) return; if (await action("/deposits", "PATCH", { invoiceId: selected.invoiceId, status: "void" })) setSelected(null); }}>Void deposit</button>}
        </div>}
      </div>}
    </details>{error && <p role="alert">{error}</p>}
  </section>{selected && <div className="k1-deposit-print"><DocumentPreview title="Deposit invoice" brand={brand} meta={[["Number", selected.invoiceId], ["Work order", jobId]]} billTo={selected.billTo} serviceAt={selected.serviceAt} opening={selected.opening} groups={invoiceGroups(selected)} totalLabel="Deposit due" total={selected.total}>{!readOnly && selected.status === "sent" && invoiceBalance(selected) > 0 && <InvoicePayPrint link={payLinks[selected.invoiceId] ?? null} businessId={businessId} jobId={jobId} invoiceId={selected.invoiceId} deposit />}</DocumentPreview></div>}</>;
}
