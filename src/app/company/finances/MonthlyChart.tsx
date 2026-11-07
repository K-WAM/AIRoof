"use client";
import { useState } from "react";
import type { FinanceSummary } from "@/types/finance";
import styles from "./finances.module.css";
const money = (n:number) => n.toLocaleString("en-US", {style:"currency",currency:"USD",minimumFractionDigits:0,maximumFractionDigits:2});
export function monthLabel(month:string, long = false) { return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", {month:long?"long":"short", ...(long?{year:"numeric"}:{}),timeZone:"UTC"}); }
export function monthRange(month:string) {
  const [year,m] = month.split("-").map(Number);
  return {from:`${month}-01`,to:`${month}-${new Date(Date.UTC(year,m,0)).getUTCDate()}`};
}
export function MonthlyChart({months,activeMonth,onSelect,caption}:{months:FinanceSummary["byMonth"];activeMonth:string;onSelect:(month:string)=>void;caption:string}) {
  const [hovered,setHovered] = useState("");
  const max = Math.max(1000,...months.flatMap(m=>[m.invoiced,m.collected]));
  const top = Math.ceil(max/3000)*3000;
  const plotHeight=150, bottom=178, left=48, step=44;
  const pointed=months.find(m=>m.month===hovered);
  return <section className={styles.chartCard} aria-labelledby="monthly-chart-title">
    <div className={styles.chartHead}><h2 id="monthly-chart-title">Invoiced and collected by month</h2><div className={styles.legend}><span><i/>Invoiced</span><span><i/>Collected</span></div></div>
    <div className={styles.chartPlot}>
      <svg viewBox="0 0 590 206" preserveAspectRatio="none" aria-label="Monthly invoices and collections">
        {[0,1,2,3].map(i=>{const y=bottom-i*plotHeight/3;return <g key={i}><line x1={left} x2="580" y1={y} y2={y} stroke="var(--border)" strokeWidth="1"/><text x="40" y={y+4} textAnchor="end">${(top*i/3/1000).toLocaleString("en-US",{maximumFractionDigits:1})}k</text></g>})}
        {months.map((m,i)=>{const x=left+i*step;const label=`${monthLabel(m.month,true)}: invoiced ${money(m.invoiced)}, collected ${money(m.collected)}`;return <g key={m.month} role="button" tabIndex={0} aria-label={label} aria-pressed={activeMonth===m.month}
          className={styles.month} onMouseEnter={()=>setHovered(m.month)} onMouseLeave={()=>setHovered("")} onFocus={()=>setHovered(m.month)} onBlur={()=>setHovered("")} onClick={()=>onSelect(m.month)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect(m.month)}}}>
          <rect className={styles.monthTarget} x={x} y="16" width={step-2} height="186" rx="5" fill={activeMonth===m.month?"var(--accent-tint, #e6f3f1)":"transparent"}/>
          <rect x={x+5} y={bottom-m.invoiced/top*plotHeight} width="13" height={m.invoiced/top*plotHeight} rx="3" fill="var(--accent)" pointerEvents="none"/>
          <rect x={x+21} y={bottom-m.collected/top*plotHeight} width="13" height={m.collected/top*plotHeight} rx="3" fill="#6352a3" pointerEvents="none"/>
          <text className={i%3!==0?styles.optionalLabel:undefined} x={x+20} y="198" textAnchor="middle" pointerEvents="none">{monthLabel(m.month)}</text>
        </g>})}
      </svg>
      <div className={styles.tooltip} role="status">{pointed ? `${monthLabel(pointed.month,true)} · Invoiced ${money(pointed.invoiced)} · Collected ${money(pointed.collected)}` : "Choose a month to filter invoices."}</div>
    </div>
    <p className={styles.caption}>{caption}</p>
    <table className="sr-only"><caption>Invoiced and collected by month</caption><thead><tr><th>Month</th><th>Invoiced</th><th>Collected</th></tr></thead><tbody>{months.map(m=><tr key={m.month}><th>{monthLabel(m.month,true)}</th><td>{money(m.invoiced)}</td><td>{money(m.collected)}</td></tr>)}</tbody></table>
  </section>;
}
