"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import type { PayrollPerson, PayrollSummary } from "@/types/payroll";
import s from "../preview/preview.module.css";
function date(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function week(offset = 0) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7 + offset * 7); const start = date(d); d.setDate(d.getDate() + 6); return [start, date(d)] as const; }
function csv(people: PayrollPerson[]) {
  const rows = [["Name", "Crew", "Regular hours", "Overtime hours", "Days", "Jobs", "Flags", "Estimated pay"], ...people.map((p) => [p.name, p.crew ?? "", p.regularHours, p.overtimeHours, p.days, p.jobs, p.flags.join("; "), p.estimatedGross ?? ""])];
  const data = rows.map((r) => r.map((v) => `"${String(v).replace(/^[=+@\-]/, "'").replace(/"/g, '""')}"`).join(",")).join("\r\n"); const url = URL.createObjectURL(new Blob([data], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = "payroll.csv"; a.click(); URL.revokeObjectURL(url);
}
export default function PayrollPage() {
  const { user } = useAuth(); const businessId = useBusinessId(); const { vocab } = useBusinessModules();
  const [start, setStart] = useState(() => week()[0]); const [end, setEnd] = useState(() => week()[1]); const [period, setPeriod] = useState("this");
  const [data, setData] = useState<(PayrollSummary & { capped?: boolean }) | null>(null); const [error, setError] = useState("");
  useEffect(() => {
    if (!user || !businessId || !start || !end) return;
    const controller = new AbortController(); const q = new URLSearchParams({ businessId, periodStart: start, periodEnd: end });
    setError(""); fetch(`/api/company/payroll?${q}`, { signal: controller.signal }).then(async (r) => { if (!r.ok) throw new Error("Choose a valid period of up to 31 days, or check access."); return r.json(); }).then(setData).catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [user, businessId, start, end]);
  function selectPeriod(value: string) { setPeriod(value); if (value !== "custom") { const [a, b] = week(value === "last" ? -1 : 0); setStart(a); setEnd(b); } }
  return <div className={s.page}>
    <header className={s.header}><div><h1>Payroll</h1><p className={s.subtitle}>Review hours before preparing payroll.</p></div><span className={s.badge}>Preview</span></header>
    <div className={s.toolbar}><label className={s.field}>Period<select value={period} onChange={(e) => selectPeriod(e.target.value)}><option value="this">This week</option><option value="last">Last week</option><option value="custom">Custom</option></select></label>{period === "custom" && <><label className={s.field}>From<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label><label className={s.field}>To<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label></>}<div className={s.actions}><button className="button secondary" disabled={!data?.people.length} onClick={() => csv(data?.people ?? [])}>Export CSV</button><span><button className="button primary" disabled title="Available in the pilot">Approve period</button><small style={{ display: "block" }}>Available in the pilot</small></span></div></div>
    {error ? <p role="alert">{error}</p> : !data ? <p>Loading hours...</p> : <section className={s.card}>
      <h2>{start} to {end}</h2>
      {!data.people.length ? <p className={s.empty}>No punches in this period.</p> : <table className={s.table}><thead><tr><th>Person</th><th>{vocab.resourceNoun}</th><th>Regular h</th><th>Overtime h</th><th>Days</th><th>{vocab.jobNounPlural}</th><th>Flags</th>{data.people.some((p) => p.estimatedGross !== undefined) && <th>Estimated pay</th>}</tr></thead><tbody>{data.people.map((p) => <tr key={p.workerKey}><td>{p.name}</td><td>{p.crew || "—"}</td><td>{p.regularHours.toFixed(2)}</td><td>{p.overtimeHours.toFixed(2)}</td><td>{p.days}</td><td>{p.jobs}</td><td>{p.flags.join(", ") || "—"}</td>{data.people.some((person) => person.estimatedGross !== undefined) && <td>{p.estimatedGross === undefined ? "—" : p.estimatedGross.toLocaleString("en-US", { style: "currency", currency: "USD" })}</td>}</tr>)}</tbody></table>}
      <div className={s.total}><span>Regular <strong>{data.totals.regularHours.toFixed(2)} h</strong></span><span>Overtime <strong>{data.totals.overtimeHours.toFixed(2)} h</strong></span>{data.totals.estimatedGross !== undefined && <span>Estimated pay <strong>{data.totals.estimatedGross.toLocaleString("en-US", { style: "currency", currency: "USD" })}</strong></span>}</div>{data.capped && <p>Showing up to 5,000 punches.</p>}
    </section>}
    <p className={s.note}>Preview of recorded hours; taxes and withholding are not calculated.</p>
  </div>;
}
