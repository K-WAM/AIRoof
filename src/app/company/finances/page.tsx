"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessId } from "@/hooks/useBusinessId";
import { Sheet } from "@/components/ui/Sheet";
import { CompanyFilter } from "@/components/companies/CompanyFilter";
import { CompanyBadge, companyBadgeLabel } from "@/components/companies/CompanyBadge";
import type { FinanceRow, FinanceSummary } from "@/types/finance";
import type { BootstrapCompany } from "@/types/company";
import s from "../preview/preview.module.css";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
function iso(d: Date) { return d.toISOString().slice(0, 10); }
function defaultFrom() { return iso(new Date(Date.now() - 90 * 86400000)); }
function download(rows: FinanceRow[], companies?: BootstrapCompany[]) {
  const multi = (companies?.length ?? 0) >= 2;
  const shortName = (companyId: unknown) => companies?.find((c) => c.id === companyId)?.shortName ?? "";
  const header = ["Invoice", ...(multi ? ["Company"] : []), "Job", "Customer", "Issued", "Due", "Days late", "Total", "Owed", "Status"];
  const csv = [header, ...rows.map((r) => [r.invoiceNo, ...(multi ? [shortName(r.companyId)] : []), r.jobId ?? "", r.customer, iso(new Date(r.issuedAt)), r.dueAt ? iso(new Date(r.dueAt)) : "", r.daysLate ?? 0, r.total, r.balance, r.status])].map((row) => row.map((x) => `"${String(x).replace(/^[=+@\-]/, "'").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "invoices.csv"; link.click(); URL.revokeObjectURL(url);
}
export default function FinancesPage() {
  const router = useRouter();
  const { user } = useAuth(); const businessId = useBusinessId();
  const [from, setFrom] = useState(defaultFrom); const [to, setTo] = useState(() => iso(new Date()));
  const [customer, setCustomer] = useState(""); const [jobType, setJobType] = useState(""); const [status, setStatus] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false); const [helpOpen, setHelpOpen] = useState(false);
  const [companyFilter, setCompanyFilter] = useState("all");
  const [data, setData] = useState<(FinanceSummary & { capped?: boolean; companies?: BootstrapCompany[] }) | null>(null); const [error, setError] = useState("");
  const [selection, setSelection] = useState("");
  const [sort, setSort] = useState<"issuedAt" | "customer" | "balance">("issuedAt");
  useEffect(() => {
    if (!user || !businessId) return;
    const controller = new AbortController(); const q = new URLSearchParams({ businessId });
    if (from) q.set("from", from); if (to) q.set("to", to); if (customer) q.set("customer", customer); if (jobType) q.set("jobType", jobType); if (status) q.set("status", status); if (companyFilter !== "all") q.set("company", companyFilter);
    setError(""); fetch(`/api/company/finance?${q}`, { signal: controller.signal }).then(async (r) => { if (!r.ok) throw new Error("Finances could not be loaded."); return r.json(); }).then(setData).catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [user, businessId, from, to, customer, jobType, status, companyFilter]);
  const rows = useMemo(() => [...(data?.rows ?? [])].filter((r) => {
    if (selection === "collected") return r.total > r.balance;
    if (selection === "outstanding") return r.balance > 0;
    if (selection === "past due") return (r.daysLate ?? 0) > 0 && r.balance > 0;
    if (selection.startsWith("age:")) {
      const late = r.daysLate ?? 0; const bucket = selection.slice(4);
      return r.balance > 0 && (bucket === "Not due yet" ? late === 0 : bucket === "1–30 days" ? late >= 1 && late <= 30 : bucket === "31–60 days" ? late >= 31 && late <= 60 : bucket === "61–90 days" ? late >= 61 && late <= 90 : late > 90);
    }
    return true;
  }).sort((a, b) => sort === "customer" ? a.customer.localeCompare(b.customer) : sort === "balance" ? b.balance - a.balance : b.issuedAt - a.issuedAt), [data, sort, selection]);
  const age = data?.aging; const groups = age ? [["Not due yet", age.current], ["1–30 days", age.d1_30], ["31–60 days", age.d31_60], ["61–90 days", age.d61_90], ["Over 90 days", age.d90plus]] as const : [];
  const toggle = (value: string) => setSelection((old) => old === value ? "" : value);
  const clearAll = () => { setFrom(""); setTo(""); setCustomer(""); setJobType(""); setStatus(""); setSelection(""); setCompanyFilter("all"); };
  const destination = (r: FinanceRow) => r.jobId ? `/company/jobs/${encodeURIComponent(r.jobId)}` : r.customerId ? `/company/customers/${encodeURIComponent(r.customerId)}` : "";
  const max = Math.max(1, ...groups.map((g) => g[1]));
  return <div className={s.page}>
    <header className={s.header}><div><h1>Finances</h1><p className={s.subtitle}>See who owes you and how much is late.</p></div><button className="button secondary" onClick={() => setHelpOpen(true)}>How these numbers are worked out</button></header>
    {data?.companies && <div style={{ marginBottom: 12 }}><CompanyFilter companies={data.companies} value={companyFilter} onChange={setCompanyFilter} /></div>}
    <div className={s.toolbar}><button className="button secondary" onClick={() => setFiltersOpen(!filtersOpen)}>Filters</button><div className={s.actions}>
      {from && <button className="button small" onClick={() => setFrom("")}>From {from} ×</button>}{to && <button className="button small" onClick={() => setTo("")}>To {to} ×</button>}{customer && <button className="button small" onClick={() => setCustomer("")}>{customer} ×</button>}{jobType && <button className="button small" onClick={() => setJobType("")}>{jobType} ×</button>}{status && <button className="button small" onClick={() => setStatus("")}>{status} ×</button>}
      {selection && <button className="button small" onClick={() => setSelection("")}>{selection.replace("age:", "")} &times;</button>}{companyFilter !== "all" && <button className="button small" onClick={() => setCompanyFilter("all")}>{companyFilter} &times;</button>}{(from || to || customer || jobType || status || selection || companyFilter !== "all") && <button className="button small" onClick={clearAll}>Clear all</button>}
    </div></div>
    {filtersOpen && <div className={s.filters}><label className={s.field}>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className={s.field}>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label><label className={s.field}>Customer<input value={customer} onChange={(e) => setCustomer(e.target.value)} /></label><label className={s.field}>Work type<input value={jobType} onChange={(e) => setJobType(e.target.value)} /></label><label className={s.field}>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="unpaid">Unpaid</option><option value="partly_paid">Partly paid</option><option value="paid">Paid</option></select></label></div>}
    {error ? <p role="alert">{error}</p> : !data ? <p>Loading finances...</p> : <>
      <div className={`${s.kpis} k2-finance-kpis`}>{[["Invoiced", data.totals.invoiced], ["Collected", data.totals.collected], ["Outstanding", data.totals.outstanding], ["Past due", data.totals.pastDue]].map(([label, value]) => <button type="button" className={`${s.card} ${s.kpi}`} key={label} aria-pressed={selection === String(label).toLowerCase()} onClick={() => toggle(String(label).toLowerCase())}><div className={s.kpiLabel}>{label}</div><strong className={s.value}>{money(Number(value))}</strong></button>)}</div>
      {data.rows.length === 0 ? <section className={`${s.card} ${s.empty}`}><h2>No invoices in this period</h2><p>Change the filters to see other invoices.</p></section> : <>
      <section className={s.card}><h2>How late are unpaid invoices?</h2>{groups.map(([label, value]) => <button type="button" key={label} className={s.row} style={{ width: "100%", cursor: "pointer", background: "transparent", border: 0, borderBottom: "1px solid var(--border)", textAlign: "left" }} aria-pressed={selection === `age:${label}`} onClick={() => toggle(`age:${label}`)}><span>{label}</span><div className={s.bar} style={{ flex: 1 }}><span style={{ width: `${value / max * 100}%` }} /></div><strong>{money(value)}</strong></button>)}</section>
      <section className={s.card}><h2>Who owes the most?</h2>{data.topOwing.length ? data.topOwing.map((row) => <button key={row.customer} className={s.row} style={{ width: "100%", background: "none", borderLeft: 0, borderRight: 0, borderTop: 0, cursor: "pointer" }} onClick={() => setCustomer(customer === row.customer ? "" : row.customer)}><span>{row.customer}</span><strong>{money(row.amount)}</strong></button>) : <p>Nothing is outstanding.</p>}</section>
      <section className={s.card}><div className={s.toolbar}><h2>Invoices</h2><div className={s.actions}><label>Sort <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="issuedAt">Newest</option><option value="customer">Customer</option><option value="balance">Amount owed</option></select></label><button className="button secondary" onClick={() => download(rows, data.companies)}>Export CSV</button></div></div><table className={s.table}><thead><tr><th>Invoice</th><th>Customer</th><th>Issued</th><th>Due</th><th>Invoiced</th><th>Owed</th><th>Status</th></tr></thead><tbody>{rows.map((r, i) => <tr key={`${r.source}-${r.invoiceNo}-${i}`} tabIndex={destination(r) ? 0 : undefined} onClick={() => { const url = destination(r); if (url) router.push(url); }} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && destination(r)) { e.preventDefault(); router.push(destination(r)); } }} style={destination(r) ? { cursor: "pointer" } : undefined}><td>{destination(r) ? <Link href={destination(r)} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>{r.invoiceNo}{r.jobId && <span> - {r.jobId}</span>}</Link> : r.invoiceNo}</td><td>{r.customerId ? <Link href={`/company/customers/${encodeURIComponent(r.customerId)}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>{r.customer}</Link> : r.customer}{data.companies && companyBadgeLabel(data.companies, r.companyId) && <> <CompanyBadge companies={data.companies} companyId={r.companyId} /></>}</td><td>{iso(new Date(r.issuedAt))}</td><td>{r.dueAt ? iso(new Date(r.dueAt)) : ""}</td><td>{money(r.total)}</td><td>{money(r.balance)}</td><td>{r.status.replace("_", " ")}{r.daysLate ? <strong> · {r.daysLate} {r.daysLate === 1 ? "day" : "days"} late</strong> : null}</td></tr>)}</tbody></table></section></>}
      {data.capped && <p>Showing up to 2,000 records from each source.</p>}
    </>}
    <p className={s.note}>From your Jobba export and invoices sent from this app</p>
    <Sheet open={helpOpen} onClose={() => setHelpOpen(false)} title="How these numbers are worked out"><div style={{ padding: 20 }}><p>Invoiced is the total for the selected period. Outstanding is the unpaid balance; past due is the part past its due date. Collected is the invoiced total less the balance owed. Imported Jobba invoices are due 30 days after their issue date; app invoices use their own due date when available, otherwise 30 days after issue. Deposit invoices are included as invoices.</p></div></Sheet>
  </div>;
}
