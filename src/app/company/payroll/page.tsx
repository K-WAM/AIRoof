"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import type { WorkerDay, Punch } from "@/types/timeclock";
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
  const [data, setData] = useState<(PayrollSummary & { capped?: boolean; timezone: string; days: WorkerDay[]; punches: Pick<Punch, "workerKey" | "dayKey" | "type" | "at" | "jobId">[] }) | null>(null); const [error, setError] = useState("");
  const [sample, setSample] = useState(false);
  const [openPerson, setOpenPerson] = useState("");
  useEffect(() => {
    if (!user || !businessId || !start || !end) return;
    const controller = new AbortController(); const q = new URLSearchParams({ businessId, periodStart: start, periodEnd: end });
    setError(""); fetch(`/api/company/payroll?${q}`, { signal: controller.signal }).then(async (r) => { if (!r.ok) throw new Error("Choose a valid period of up to 31 days, or check access."); return r.json(); }).then(setData).catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [user, businessId, start, end]);
  const samplePerson: PayrollPerson = { workerKey: "sample", name: "Jordan Example", crew: "Sample crew", regularHours: 40, overtimeHours: 2, days: 5, jobs: 2, flags: [] };
  const shown = sample && data ? { ...data, people: [samplePerson], totals: { regularHours: 40, overtimeHours: 2 } } : data;
  function selectPeriod(value: string) { setSample(false); setPeriod(value); if (value !== "custom") { const [a, b] = week(value === "last" ? -1 : 0); setStart(a); setEnd(b); } }
  return <div className={s.page}>
    <header className={s.header}><div><h1>Payroll</h1><p className={s.subtitle}>Review hours before preparing payroll.</p></div><span className={s.badge}>Preview</span></header>
    <div className={s.toolbar}><label className={s.field}>Period<select value={period} onChange={(e) => selectPeriod(e.target.value)}><option value="this">This week</option><option value="last">Last week</option><option value="custom">Custom</option></select></label><><label className={s.field}>From<input type="date" value={start} onChange={(e) => { setStart(e.target.value); setPeriod("custom"); setSample(false); }} /></label><label className={s.field}>To<input type="date" value={end} onChange={(e) => { setEnd(e.target.value); setPeriod("custom"); setSample(false); }} /></label></><div className={s.actions}><button className="button secondary" disabled={!data?.people.length} onClick={() => csv(data?.people ?? [])}>Export CSV</button><span><button className="button primary" disabled title="Available in the pilot">Approve period</button><small style={{ display: "block" }}>Available in the pilot</small></span></div></div>
    {error ? <p role="alert">{error}</p> : !shown ? <p>Loading hours...</p> : <section className={s.card}>
      <h2>{start} to {end}</h2>{sample && <p role="status">Sample data — not your crew <button className="button small" onClick={() => setSample(false)}>Close sample</button></p>}
      {!shown.people.length ? <div className={s.empty}><p>No punches in this period.</p><button className="button secondary" onClick={() => setSample(true)}>Show an example week</button></div> : <table className={s.table}><thead><tr><th>Person</th><th>{vocab.resourceNoun}</th><th>Regular h</th><th>Overtime h</th><th>Days</th><th>{vocab.jobNounPlural}</th><th>Flags</th>{shown.people.some((p) => p.estimatedGross !== undefined) && <th>Estimated pay</th>}</tr></thead>{shown.people.map((p) => <tbody key={p.workerKey}><tr><td><button type="button" aria-expanded={openPerson === p.workerKey} onClick={() => setOpenPerson(openPerson === p.workerKey ? "" : p.workerKey)}>{p.name}</button></td><td>{p.crew || "—"}</td><td>{p.regularHours.toFixed(2)}</td><td>{p.overtimeHours.toFixed(2)}</td><td>{p.days}</td><td>{p.jobs}</td><td>{p.flags.join(", ") || "—"}</td>{shown.people.some((person) => person.estimatedGross !== undefined) && <td>{p.estimatedGross === undefined ? "—" : p.estimatedGross.toLocaleString("en-US", { style: "currency", currency: "USD" })}</td>}</tr>{openPerson === p.workerKey && <tr><td colSpan={8}><p>Overtime for this period: {p.overtimeHours.toFixed(2)} h</p>{sample ? <p>Sample: Monday–Friday, 8:00 AM–4:30 PM · Example jobs · 42 hours (2 overtime)</p> : shown.days.filter((day) => day.workerKey === p.workerKey).map((day) => <div key={day.dayKey}><strong>{day.dayKey}</strong> · {((day.officeMs + Object.values(day.jobs).reduce((n, job) => n + job.ms, 0)) / 3600000).toFixed(2)} h {Object.keys(day.jobs).join(", ")}<ul>{shown.punches.filter((punch) => punch.workerKey === p.workerKey && punch.dayKey === day.dayKey).sort((a, b) => a.at - b.at).map((punch, i) => <li key={i}>{new Date(punch.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: shown.timezone })} · {punch.type.replaceAll("_", " ")} {punch.jobId || ""}</li>)}</ul></div>)}</td></tr>}</tbody>)}</table>}
      <div className={s.total}><span>Regular <strong>{shown.totals.regularHours.toFixed(2)} h</strong></span><span>Overtime <strong>{shown.totals.overtimeHours.toFixed(2)} h</strong></span>{shown.totals.estimatedGross !== undefined && <span>Estimated pay <strong>{shown.totals.estimatedGross.toLocaleString("en-US", { style: "currency", currency: "USD" })}</strong></span>}</div>{shown.capped && <p>Showing up to 5,000 punches.</p>}
    </section>}
    <p className={s.note}>Preview of recorded hours; taxes and withholding are not calculated.</p>
  </div>;
}
