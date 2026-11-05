"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, MapPin, Radar, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { company, daysAgo, money, permitDate, permits } from "../sample-data";
import s from "../preview.module.css";

export default function PermitsPreview() {
  const { user } = useAuth();
  const [type, setType] = useState("");
  const [use, setUse] = useState("");
  const [county, setCounty] = useState("");
  const [from, setFrom] = useState("2026-11-01");
  const [to, setTo] = useState("2026-11-30");
  const [page, setPage] = useState(0);
  if (!user?.superadmin) return <p>Not available</p>;
  const filtered = permits.filter(p => (!type || p.type === type) && (!use || p.use === use) && (!county || p.county === county) && (!from || p.date >= from) && (!to || p.date <= to));
  const pages = Math.ceil(filtered.length / 5);
  const update = (setter: (value: string) => void, value: string) => { setter(value); setPage(0); };
  return <div className={s.page} data-testid="preview-page">
    <header className={s.header}><div><p className={s.eyebrow}>{company}</p><h1>Permit Leads</h1><p className={s.subtitle}>New roofing permits near you</p><div className={s.period}><MapPin size={15} />South Florida · As of Nov 30, 2026</div></div><span className={s.badge}><Radar size={13} />Preview — sample data</span></header>
    <section className={s.card}>
      <div className={s.cardHead}><div><h2>Find your next roofing job</h2><p className={s.subtitle} style={{ marginTop: 6 }}>Spot permits without a roofer of record.</p></div><Radar size={22} style={{ color: "var(--accent)", flexShrink: 0 }} /></div>
      <div className={s.filters}>
        <label className={s.field}>County<select value={county} onChange={e => update(setCounty, e.target.value)}><option value="">All counties</option>{["Miami-Dade", "Broward", "Palm Beach"].map(c => <option key={c}>{c}</option>)}</select></label>
        <label className={s.field}>Roof work<select value={type} onChange={e => update(setType, e.target.value)}><option value="">All types</option>{["Re-roof", "New roof", "Repair"].map(t => <option key={t}>{t}</option>)}</select></label>
        <label className={s.field}>Property<select value={use} onChange={e => update(setUse, e.target.value)}><option value="">All properties</option><option>Residential</option><option>Commercial</option></select></label>
        <label className={s.field}>From<input type="date" value={from} onChange={e => update(setFrom, e.target.value)} /></label>
        <label className={s.field}>Through<input type="date" value={to} onChange={e => update(setTo, e.target.value)} /></label>
      </div>
      <div className={s.toolbar}><p className={s.muted} role="status">{filtered.length} permits · {filtered.filter(p => !p.contractor).length} without a roofer</p><button className="button secondary" onClick={() => { setType(""); setUse(""); setCounty(""); setFrom("2026-11-01"); setTo("2026-11-30"); setPage(0); }}>Reset filters</button></div>
      <table className={s.table}><caption className={s.muted} style={{ textAlign: "left", marginBottom: 10 }}>Fictional permits · newest first</caption><thead><tr>{["Permit / pulled", "Property", "Roof work", "Valuation", "Contractor of record"].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{filtered.slice(page * 5, page * 5 + 5).map(p => <tr key={p.number} className={p.contractor ? "" : s.fresh} data-testid="permit-row"><td><strong>{p.number}</strong><p className={s.muted}>{permitDate(p.date)}</p><p className={s.muted}>{daysAgo(p.date) === 0 ? "Today · 0 days ago" : `${daysAgo(p.date)} ${daysAgo(p.date) === 1 ? "day" : "days"} ago`}</p></td><td><span className={s.mobileLabel}>Property</span><strong>{p.address}</strong><p className={s.muted}>{p.city} · {p.county}</p><p className={s.muted}>{p.use}</p></td><td><span className={s.mobileLabel}>Roof work</span>{p.type}</td><td><span className={s.mobileLabel}>Valuation</span>{money(p.valuation)}</td><td>{p.contractor ? <><span className={s.mobileLabel}>Contractor of record</span>{p.contractor}</> : <><span className={s.badge}>Fresh lead</span><p className={s.leadNote}>Fresh lead — be one of the first to reach out</p><p className={s.muted}>No roofer of record</p></>}</td></tr>)}</tbody></table>
      {filtered.length === 0 && <div className={s.empty}><h2>No permits match these filters</h2><p className={s.subtitle}>Try another county or widen the date range.</p></div>}
      <div className={s.footer}><span>{filtered.length ? `${page * 5 + 1}–${Math.min(page * 5 + 5, filtered.length)} of ${filtered.length} permits` : "0 permits"}</span><div className={s.actions}><button className="button secondary" aria-label="Previous permits" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ArrowLeft size={15} /></button><button className="button secondary" aria-label="Next permits" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}><ArrowRight size={15} /></button></div></div>
    </section>
    <div className={s.toolbar} style={{ marginTop: 20 }}><p className={s.note}>All addresses and permit numbers are fictional. No county records are connected.</p><button className="button primary" disabled><Plus size={15} />Create request · Preview</button></div>
  </div>;
}
