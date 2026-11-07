"use client";
import { useEffect, useRef, useState } from "react";
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
  const plot = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(590);
  useEffect(() => {
    const element = plot.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const max = Math.max(1000,...months.flatMap(m=>[m.invoiced,m.collected]));
  const top = Math.ceil(max/3000)*3000;
  const height = width < 600 ? 170 : 210;
  const plotHeight = height - 56, bottom = height - 30, left = 44;
  const step = (width - left - 8) / 12;
  const barWidth = Math.min(24, step * .29);
  const pointed=months.find(m=>m.month===hovered);
  return <section className={styles.chartCard} aria-labelledby="monthly-chart-title">
    <div className={styles.chartHead}><h2 id="monthly-chart-title">Invoiced and collected by month</h2><div className={styles.legend}><span><i/>Invoiced</span><span><i/>Collected</span></div></div>
    <div className={styles.chartPlot} ref={plot}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" aria-label="Monthly invoices and collections">
        {[0,1,2,3].map(i=>{const y=bottom-i*plotHeight/3;return <g key={i}><line x1={left} x2={width - 8} y1={y} y2={y} stroke="var(--border)" strokeWidth="1"/><text x="36" y={y+4} textAnchor="end">${(top*i/3/1000).toLocaleString("en-US",{maximumFractionDigits:1})}k</text></g>})}
        {months.map((m,i)=>{const x=left+i*step;const label=`${monthLabel(m.month,true)}: invoiced ${money(m.invoiced)}, collected ${money(m.collected)}`;return <g key={m.month} role="button" tabIndex={0} aria-label={label} aria-pressed={activeMonth===m.month}
          className={styles.month} onMouseEnter={()=>setHovered(m.month)} onMouseLeave={()=>setHovered("")} onFocus={()=>setHovered(m.month)} onBlur={()=>setHovered("")} onClick={()=>onSelect(m.month)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect(m.month)}}}>
          <rect className={styles.monthTarget} x={x} y="16" width={step-2} height={height-20} rx="5" fill={activeMonth===m.month?"var(--accent-tint, #e6f3f1)":"transparent"}/>
          <rect x={x+step/2-barWidth-1} y={bottom-m.invoiced/top*plotHeight} width={barWidth} height={m.invoiced/top*plotHeight} rx="3" fill="var(--accent)" pointerEvents="none"/>
          <rect x={x+step/2+1} y={bottom-m.collected/top*plotHeight} width={barWidth} height={m.collected/top*plotHeight} rx="3" fill="#6352a3" pointerEvents="none"/>
          <text className={i%3!==0?styles.optionalLabel:undefined} x={x+step/2} y={height-8} textAnchor="middle" pointerEvents="none">{monthLabel(m.month)}</text>
        </g>})}
      </svg>
      <div className={styles.tooltip} role="status">{pointed ? `${monthLabel(pointed.month,true)} · Invoiced ${money(pointed.invoiced)} · Collected ${money(pointed.collected)}` : "Choose a month to filter invoices."}</div>
    </div>
    <p className={styles.caption}>{caption}</p>
    <table className="sr-only"><caption>Invoiced and collected by month</caption><thead><tr><th>Month</th><th>Invoiced</th><th>Collected</th></tr></thead><tbody>{months.map(m=><tr key={m.month}><th>{monthLabel(m.month,true)}</th><td>{money(m.invoiced)}</td><td>{money(m.collected)}</td></tr>)}</tbody></table>
  </section>;
}
