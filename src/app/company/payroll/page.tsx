"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import { examplePayroll, periodDates, type PayrollView } from "@/lib/payroll/timesheet";
import type { PayrollPerson } from "@/types/payroll";
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
  const [data, setData] = useState<PayrollView | null>(null); const [error, setError] = useState("");
  const [sample, setSample] = useState(false);
  const [openPerson, setOpenPerson] = useState("");
  useEffect(() => {
    if (!user || !businessId || !start || !end) return;
    const controller = new AbortController(); const q = new URLSearchParams({ businessId, periodStart: start, periodEnd: end });
    setError(""); fetch(`/api/company/payroll?${q}`, { signal: controller.signal }).then(async (r) => { if (!r.ok) throw new Error("Choose a valid period of up to 31 days, or check access."); return r.json(); }).then(setData).catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [user, businessId, start, end]);
  const shown = sample ? examplePayroll(start) : data;
  function selectPeriod(value: string) { setSample(false); setPeriod(value); if (value !== "custom") { const [a, b] = week(value === "last" ? -1 : 0); setStart(a); setEnd(b); } }
  return <div className={s.page}>
    <header className={s.header}><div><h1>Payroll</h1><p className={s.subtitle}>Review hours before preparing payroll.</p></div><span className={s.badge}>Preview</span></header>
    <div className={s.toolbar}><label className={s.field}>Period<select value={period} onChange={(e) => selectPeriod(e.target.value)}><option value="this">This week</option><option value="last">Last week</option><option value="custom">Custom</option></select></label><><label className={s.field}>From<input type="date" value={start} onChange={(e) => { setStart(e.target.value); setPeriod("custom"); setSample(false); }} /></label><label className={s.field}>To<input type="date" value={end} onChange={(e) => { setEnd(e.target.value); setPeriod("custom"); setSample(false); }} /></label></><div className={s.actions}><button className="button secondary" disabled={!data?.people.length} onClick={() => csv(data?.people ?? [])}>Export CSV</button><span><button className="button primary" disabled title="Available in the pilot">Approve period</button><small style={{ display: "block" }}>Available in the pilot</small></span></div></div>
    {error ? <p role="alert">{error}</p> : !shown ? <p>Loading hours...</p> : <section className={s.card}>
      <h2>{shown.periodStart} to {shown.periodEnd}</h2>{sample && <p role="status">Sample data — not your crew <button className="button small" onClick={() => setSample(false)}>Close sample</button></p>}
      {!shown.people.length ? <div className={s.empty}><p>No punches in this period.</p><button className="button secondary" onClick={() => setSample(true)}>Show an example week</button></div> : <div className={s.payrollPeople}>{shown.people.map((p) => <section key={p.workerKey} className={s.payrollPerson}>
        <button type="button" className={s.payrollPersonButton} aria-label={p.name} aria-expanded={openPerson === p.workerKey} aria-controls={`timesheet-${p.workerKey}`} onClick={() => setOpenPerson(openPerson === p.workerKey ? "" : p.workerKey)}>
          <strong>{p.name}</strong><span>{vocab.resourceNoun}: {p.crew || "Unassigned"}</span>
          <span>Regular {p.regularHours.toFixed(1)} h <span aria-hidden="true"> / </span> Overtime {p.overtimeHours.toFixed(1)} h</span>
          <span>Days: {p.days} / {vocab.jobNounPlural}: {p.jobs}</span><span>{openPerson === p.workerKey ? "Close timesheet" : "View timesheet"}</span>
        </button>
        {p.flags.length > 0 && <p>Flags: {p.flags.join(", ")}</p>}
        {p.estimatedGross !== undefined && <p>Estimated pay: {p.estimatedGross.toLocaleString("en-US", { style: "currency", currency: "USD" })}</p>}
        {openPerson === p.workerKey && <div id={`timesheet-${p.workerKey}`} className={s.timesheet}>
          <p>Overtime: {p.overtimeHours.toFixed(1)} h. Only hours above 40 in a Monday-Sunday week count as overtime.</p>
          {periodDates(shown.periodStart, shown.periodEnd).map((dayKey) => {
            const day = shown.days.find((d) => d.workerKey === p.workerKey && d.dayKey === dayKey);
            const punches = shown.punches.filter((punch) => punch.workerKey === p.workerKey && punch.dayKey === dayKey).sort((a, b) => a.at - b.at);
            const hours = day ? (day.officeMs + Object.values(day.jobs).reduce((n, job) => n + job.ms, 0)) / 3600000 : 0;
            return <section key={dayKey} className={s.timesheetDay}><h3>{new Date(`${dayKey}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })} {dayKey}</h3>
              <p>Hours: {hours.toFixed(1)} h</p><p>{vocab.jobNounPlural}: {day && Object.keys(day.jobs).length ? Object.keys(day.jobs).join(", ") : "None"}</p>
              {punches.length ? <ul>{punches.map((punch, i) => <li key={i}>{punch.type.replaceAll("_", " ")}: {new Date(punch.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: shown.timezone })}{punch.jobId ? ` / ${vocab.jobNoun}: ${punch.jobId}` : ""}</li>)}</ul> : <p>Punches: None</p>}
            </section>;
          })}
        </div>}
      </section>)}</div>}

      <div className={s.total}><span>Regular <strong>{shown.totals.regularHours.toFixed(2)} h</strong></span><span>Overtime <strong>{shown.totals.overtimeHours.toFixed(2)} h</strong></span>{shown.totals.estimatedGross !== undefined && <span>Estimated pay <strong>{shown.totals.estimatedGross.toLocaleString("en-US", { style: "currency", currency: "USD" })}</strong></span>}</div>{shown.capped && <p>Showing up to 5,000 punches.</p>}
    </section>}
    <p className={s.note}>Preview of recorded hours; taxes and withholding are not calculated.</p>
  </div>;
}
