"use client";

import { CalendarDays, Download, ShieldCheck, TriangleAlert, Users, Clock3 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { company, gross, money, workers } from "../sample-data";
import s from "../preview.module.css";

export default function PayrollPreview() {
  const { user } = useAuth();
  if (!user?.superadmin) return <p>Not available</p>;
  const total = workers.reduce((sum, w) => sum + gross(w), 0);
  return <div className={s.page} data-testid="preview-page">
    <header className={s.header}><div><p className={s.eyebrow}>{company}</p><h1>Payroll</h1><p className={s.subtitle}>Your crews’ hours, ready for a closer look.</p></div><span className={s.badge}><Users size={13} />Preview — sample data</span></header>
    <div className={s.toolbar}><label className={s.field}>Pay period<select defaultValue="current" aria-label="Pay period"><option value="current">Nov 16–29, 2026 · Biweekly</option></select></label><div className={s.actions}><button className="button secondary" disabled><Download size={15} />Export CSV · Preview</button><button className="button primary" disabled><ShieldCheck size={15} />Approve period · Preview</button></div></div>
    <div className={s.kpis}>
      <section className={`${s.card} ${s.kpi}`}><div className={s.kpiLabel}>Estimated gross<Users size={16} /></div><strong className={s.value}>{money(total)}</strong><span className={s.muted}>Before taxes & deductions</span></section>
      <section className={`${s.card} ${s.kpi}`}><div className={s.kpiLabel}>Regular hours<Clock3 size={16} /></div><strong className={s.value}>{workers.reduce((sum, w) => sum + w.regular, 0)}</strong><span className={s.muted}>8 people across 3 crews</span></section>
      <section className={`${s.card} ${s.kpi}`}><div className={s.kpiLabel}>Overtime hours<CalendarDays size={16} /></div><strong className={s.value}>20</strong><span className={s.muted}>Calculated at 1.5× base rate</span></section>
      <section className={`${s.card} ${s.kpi}`}><div className={s.kpiLabel}>Missing punches<TriangleAlert size={16} /></div><strong className={`${s.value} ${s.danger}`}>2 people</strong><span className={s.muted}>Review before approving</span></section>
    </div>
    <section className={s.card}><div className={s.cardHead}><h2>Hours & earnings</h2><span className={s.muted}>8 people</span></div>
      <table className={s.table}><caption className={s.muted} style={{ textAlign: "left", marginBottom: 12 }}>Recorded hours · Nov 16–29, 2026</caption><thead><tr>{["Team member", "Role / crew", "Regular", "Overtime", "Rate / hr", "Gross", "Jobs"].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{workers.map(w => <tr key={w.name}><td><div className={s.person}><span className={s.avatar} aria-hidden="true">{w.initials}</span><div><strong className={s.name}>{w.name}</strong>{w.missing && <span className={s.flag}><TriangleAlert size={12} />Missing clock-out</span>}</div></div></td><td><span className={s.mobileLabel}>Role / crew</span>{w.role}<p className={s.muted}>{w.crew}</p></td><td><span className={s.mobileLabel}>Regular hours</span>{w.regular} hrs</td><td><span className={s.mobileLabel}>Overtime hours</span>{w.overtime} hrs</td><td><span className={s.mobileLabel}>Rate / hour</span>{money(w.rate)}</td><td><span className={s.mobileLabel}>Estimated gross</span><strong>{money(gross(w))}</strong></td><td><span className={s.mobileLabel}>Jobs worked</span>{w.jobs}</td></tr>)}</tbody></table>
      <p className={s.note}>Flagged hours are incomplete. Gross uses recorded hours only; jobs may be shared by teammates.</p>
    </section>
    <div className={`${s.grid} ${s.equal}`} style={{ marginTop: 16 }}><section className={s.card}><div className={s.cardHead}><h2>Totals by crew</h2><span className={s.muted}>Estimated gross</span></div>{["Tile crew", "Shingle crew", "Repair crew"].map(crew => { const members = workers.filter(w => w.crew === crew); return <div className={s.row} key={crew}><div><strong>{crew}</strong><p className={s.muted}>{members.reduce((sum, w) => sum + w.regular + w.overtime, 0)} hrs · {members.length} people</p></div><strong>{money(members.reduce((sum, w) => sum + gross(w), 0))}</strong></div>; })}<div className={s.total}><span>Period total</span><strong>{money(total)}</strong></div></section><section className={`${s.card} ${s.attention}`}><div className={s.cardHead}><h2>Before you approve</h2><TriangleAlert size={18} className={s.danger} /></div><p className={s.subtitle}>Two clock-outs need a review.</p>{workers.filter(w => w.missing).map(w => <div className={s.row} key={w.name}><div><strong>{w.name}</strong><p className={s.muted}>{w.crew} · Nov 27</p></div><span className={s.flag}>Clock-out missing</span></div>)}<p className={s.note}>Preview only. Approval and export are unavailable; no payroll is processed.</p></section></div>
  </div>;
}
