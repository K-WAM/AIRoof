"use client";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessId } from "@/hooks/useBusinessId";
import { Sheet } from "@/components/ui/Sheet";
import type { FinanceRow, FinanceSummary } from "@/types/finance";
import s from "../preview/preview.module.css";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
function iso(d: Date) { return d.toISOString().slice(0, 10); }
function defaultFrom() { return iso(new Date(Date.now() - 90 * 86400000)); }
function download(rows: FinanceRow[]) {
  const csv = [["Invoice", "Job", "Customer", "Issued", "Due", "Days late", "Total", "Owed", "Status"], ...rows.map((r) => [r.invoiceNo, r.jobId ?? "", r.customer, iso(new Date(r.issuedAt)), r.dueAt ? iso(new Date(r.dueAt)) : "", r.daysLate ?? 0, r.total, r.balance, r.status])].map((row) => row.map((x) => `"${String(x).replace(/^[=+@\-]/, "'").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "invoices.csv"; link.click(); URL.revokeObjectURL(url);
}
export default function FinancesPage() {
  const { user } = useAuth(); const businessId = useBusinessId();
  const [from, setFrom] = useState(defaultFrom); const [to, setTo] = useState(() => iso(new Date()));
  const [customer, setCustomer] = useState(""); const [jobType, setJobType] = useState(""); const [status, setStatus] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false); const [helpOpen, setHelpOpen] = useState(false);
  const [data, setData] = useState<(FinanceSummary & { capped?: boolean }) | null>(null); const [error, setError] = useState("");
  const [sort, setSort] = useState<"issuedAt" | "customer" | "balance">("issuedAt");
  useEffect(() => {
    if (!user || !businessId) return;
    const controller = new AbortController(); const q = new URLSearchParams({ businessId });
    if (from) q.set("from", from); if (to) q.set("to", to); if (customer) q.set("customer", customer); if (jobType) q.set("jobType", jobType); if (status) q.set("status", status);
    setError(""); fetch(`/api/company/finance?${q}`, { signal: controller.signal }).then(async (r) => { if (!r.ok) throw new Error("Finances could not be loaded."); return r.json(); }).then(setData).catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [user, businessId, from, to, customer, jobType, status]);
  const rows = useMemo(() => [...(data?.rows ?? [])].sort((a, b) => sort === "customer" ? a.customer.localeCompare(b.customer) : sort === "balance" ? b.balance - a.balance : b.issuedAt - a.issuedAt), [data, sort]);
  const age = data?.aging; const groups = age ? [["Current", age.current], ["1–30 days", age.d1_30], ["31–60 days", age.d31_60], ["61–90 days", age.d61_90], ["Over 90 days", age.d90plus]] as const : [];
  const max = Math.max(1, ...groups.map((g) => g[1]));
  return <div className={s.page}>
    <header className={s.header}><div><h1>Finances</h1><p className={s.subtitle}>See who owes you and how much is late.</p></div><button className="button secondary" onClick={() => setHelpOpen(true)}>How these numbers are worked out</button></header>
    <div className={s.toolbar}><button className="button secondary" onClick={() => setFiltersOpen(!filtersOpen)}>Filters</button><div className={s.actions}>
      {from && <button className="button small" onClick={() => setFrom("")}>From {from} ×</button>}{to && <button className="button small" onClick={() => setTo("")}>To {to} ×</button>}{customer && <button className="button small" onClick={() => setCustomer("")}>{customer} ×</button>}{jobType && <button className="button small" onClick={() => setJobType("")}>{jobType} ×</button>}{status && <button className="button small" onClick={() => setStatus("")}>{status} ×</button>}
    </div></div>
    {filtersOpen && <div className={s.filters}><label className={s.field}>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className={s.field}>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label><label className={s.field}>Customer<input value={customer} onChange={(e) => setCustomer(e.target.value)} /></label><label className={s.field}>Work type<input value={jobType} onChange={(e) => setJobType(e.target.value)} /></label><label className={s.field}>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="unpaid">Unpaid</option><option value="partly_paid">Partly paid</option><option value="paid">Paid</option></select></label></div>}
    {error ? <p role="alert">{error}</p> : !data ? <p>Loading finances...</p> : <>
      <div className={`${s.kpis} k2-finance-kpis`}>{[["Invoiced", data.totals.invoiced], ["Outstanding", data.totals.outstanding], ["Past due", data.totals.pastDue]].map(([label, value]) => <section className={`${s.card} ${s.kpi}`} key={label}><div className={s.kpiLabel}>{label}</div><strong className={s.value}>{money(Number(value))}</strong></section>)}</div>
      {data.rows.length === 0 ? <section className={`${s.card} ${s.empty}`}><h2>No invoices in this period</h2><p>Change the filters to see other invoices.</p></section> : <>
      <section className={s.card}><h2>How late are unpaid invoices?</h2>{groups.map(([label, value]) => <div key={label} className={s.row}><span>{label}</span><div className={s.bar} style={{ flex: 1 }}><span style={{ width: `${value / max * 100}%` }} /></div><strong>{money(value)}</strong></div>)}</section>
      <section className={s.card}><h2>Who owes the most?</h2>{data.topOwing.length ? data.topOwing.map((row) => <button key={row.customer} className={s.row} style={{ width: "100%", background: "none", borderLeft: 0, borderRight: 0, borderTop: 0, cursor: "pointer" }} onClick={() => setCustomer(row.customer)}><span>{row.customer}</span><strong>{money(row.amount)}</strong></button>) : <p>Nothing is outstanding.</p>}</section>
      <section className={s.card}><div className={s.toolbar}><h2>Invoices</h2><div className={s.actions}><label>Sort <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="issuedAt">Newest</option><option value="customer">Customer</option><option value="balance">Amount owed</option></select></label><button className="button secondary" onClick={() => download(rows)}>Export CSV</button></div></div><table className={s.table}><thead><tr><th>Invoice</th><th>Customer</th><th>Issued</th><th>Due</th><th>Invoiced</th><th>Owed</th><th>Status</th></tr></thead><tbody>{rows.map((r, i) => <tr key={`${r.source}-${r.invoiceNo}-${i}`}><td>{r.invoiceNo}{r.jobId && <span> · {r.jobId}</span>}</td><td>{r.customer}</td><td>{iso(new Date(r.issuedAt))}</td><td>{r.dueAt ? iso(new Date(r.dueAt)) : ""}</td><td>{money(r.total)}</td><td>{money(r.balance)}</td><td>{r.status.replace("_", " ")}{r.daysLate ? <strong> · {r.daysLate} {r.daysLate === 1 ? "day" : "days"} late</strong> : null}</td></tr>)}</tbody></table></section></>}
      {data.capped && <p>Showing up to 2,000 records from each source.</p>}
    </>}
    <p className={s.note}>From your Jobba export and invoices sent from this app</p>
    <Sheet open={helpOpen} onClose={() => setHelpOpen(false)} title="How these numbers are worked out"><div style={{ padding: 20 }}><p>Invoiced is the total for the selected period. Outstanding is the unpaid balance; past due is the part past its due date. Deposit invoices are included as invoices.</p></div></Sheet>
  </div>;
}
