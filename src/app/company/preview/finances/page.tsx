"use client";

import { ArrowUpRight, CalendarDays, CircleDollarSign, Wallet, Clock3, CircleAlert, FileText } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { aging, company, customers, jobTypes, money, revenue } from "../sample-data";
import s from "../preview.module.css";

export default function FinancesPreview() {
  const { user } = useAuth();
  if (!user?.superadmin) return <p>Not available</p>;
  return <div className={s.page} data-testid="preview-page">
    <header className={s.header}>
      <div><p className={s.eyebrow}>{company}</p><h1>Finances</h1><p className={s.subtitle}>A clear view of what you earned and what’s due.</p><div className={s.period}><CalendarDays size={15} /> November 2026 · Month-end snapshot</div></div>
      <span className={s.badge}><CircleDollarSign size={13} />Preview — sample data</span>
    </header>
    <div className={s.kpis}>
      <section className={`${s.card} ${s.kpi}`}><div className={s.kpiLabel}>Revenue this month<CircleDollarSign size={16} /></div><strong className={s.value}>$234,000</strong><span className={s.positive}><ArrowUpRight size={14} />12.5% vs Oct · $208,000</span></section>
      <section className={`${s.card} ${s.kpi}`}><div className={s.kpiLabel}>Collected<Wallet size={16} /></div><strong className={s.value}>$177,000</strong><span className={s.muted}>76% of November revenue</span></section>
      <section className={`${s.card} ${s.kpi}`}><div className={s.kpiLabel}>Outstanding<Clock3 size={16} /></div><strong className={s.value}>$57,000</strong><span className={s.muted}>Includes overdue invoices</span></section>
      <section className={`${s.card} ${s.kpi}`}><div className={s.kpiLabel}>Overdue<CircleAlert size={16} /></div><strong className={`${s.value} ${s.danger}`}>$15,000</strong><span className={s.muted}>2 invoices need a follow-up</span></section>
    </div>
    <div className={s.grid}>
      <section className={s.card}><div className={s.cardHead}><h2>Revenue trend</h2><span className={s.muted}>Last 6 months</span></div>
        <svg className={s.chart} viewBox="0 0 560 235" role="img" aria-label="Monthly revenue: June $148,000; July $164,000; August $156,000; September $189,000; October $208,000; November $234,000.">
          {[0, 1, 2].map(i => <g key={i}><line x1="48" y1={30 + i * 75} x2="545" y2={30 + i * 75} stroke="var(--border)" strokeDasharray="3 5" /><text x="0" y={34 + i * 75}>${240 - i * 120}k</text></g>)}
          {revenue.map((r, i) => <g key={r.month}><rect x={65 + i * 80} y={180 - r.value / 1600} width="44" height={r.value / 1600} rx="5" fill="var(--accent)" opacity={i === 5 ? 1 : .2 + i * .1} /><text x={87 + i * 80} y="208" textAnchor="middle">{r.month}</text></g>)}
          <text x="487" y="22" textAnchor="middle" style={{ fill: "var(--accent)", fontWeight: 700 }}>$234k</text>
        </svg>
      </section>
      <section className={s.card}><div className={s.cardHead}><h2>Invoice aging</h2><span className={s.muted}>$57,000 due</span></div><p className={s.muted}>Outstanding balance by invoice age</p><div className={s.aging} aria-hidden="true">{aging.map((a, i) => <span key={a.label} style={{ width: `${a.value / 570}%`, background: i === 0 ? "var(--accent)" : i === 1 ? "var(--c-danger-bd)" : "var(--c-danger-fg)" }} />)}</div>{aging.map((a, i) => <div className={s.row} key={a.label}><span className={i > 0 ? s.danger : ""}>{a.label}</span><strong>{money(a.value)}</strong></div>)}</section>
    </div>
    <div className={`${s.grid} ${s.equal}`}>
      <section className={s.card}><div className={s.cardHead}><h2>Top customers</h2><span className={s.muted}>By revenue</span></div>{customers.map((c, i) => <div className={s.row} key={c.name}><div><strong><span className={s.rank}>0{i + 1}</span>{c.name}</strong><p className={s.muted}>{c.jobs} {c.jobs === 1 ? "job" : "jobs"}</p></div><strong>{money(c.value)}</strong></div>)}</section>
      <section className={s.card}><div className={s.cardHead}><h2>Revenue by job type</h2><span className={s.muted}>November</span></div>{jobTypes.map(j => <div key={j.name} style={{ marginBottom: 21 }}><div className={s.row} style={{ border: 0, padding: 0 }}><span>{j.name}</span><strong>{money(j.value)}</strong></div><div className={s.bar}><span style={{ width: `${j.value / 2340}%` }} /></div><p className={s.muted} style={{ marginTop: 4 }}>{Math.round(j.value / 2340)}% of revenue</p></div>)}</section>
    </div>
    <section className={`${s.card} ${s.attention}`}><div className={s.cardHead}><h2>Needs attention</h2><span className={s.muted}>3 items</span></div><div className={s.attentionItem}><CircleAlert size={17} className={s.danger} /><div><strong>Marina Court Association · $10,500 overdue</strong><p className={s.muted}>Invoice DEMO-1048 · 42 days old</p></div></div><div className={s.attentionItem}><CircleAlert size={17} className={s.danger} /><div><strong>Daniel Brooks · $4,500 overdue</strong><p className={s.muted}>Invoice DEMO-1026 · 68 days old</p></div></div><div className={s.attentionItem}><FileText size={17} /><div><strong>3 invoice drafts haven’t been sent</strong><p className={s.muted}>$18,600 in drafts · excluded from revenue and balances</p></div></div></section>
    <p className={s.note}>Fictional sample figures as of Nov 30, 2026. Revenue includes sent and paid invoices; overdue means unpaid for more than 30 days.</p>
  </div>;
}
