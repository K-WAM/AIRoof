"use client";
import { useState, type ReactNode } from "react";
import { validCustomerSubtotal } from "@/lib/billing/jobCustomerTotals";
import { fmtMoney } from "@/lib/format/money";

type PricePatch = { priceMode?: "lines" | "project"; hideMaterials?: boolean; hideLabor?: boolean; customerSubtotal?: number; adjustmentNote?: string };
export function CustomerVersionCard({ draft = false, readOnlyRole = false, priceMode = "lines", hideMaterials = false, hideLabor = false, lineSubtotal = 0, savedLineSubtotal, customerSubtotal, customerTotal, adjustmentNote = "", acceptedQuoteSubtotal, onChange, onPreview, controls, intro, more, taxHint = "All-in price; no tax is added to this quote.", report = false, fixedPrice = false }: {
  draft?: boolean; readOnlyRole?: boolean; priceMode?: "lines" | "project"; hideMaterials?: boolean; hideLabor?: boolean;
  lineSubtotal?: number; savedLineSubtotal?: number; customerSubtotal?: number; customerTotal?: number; adjustmentNote?: string; acceptedQuoteSubtotal?: number;
  onChange?: (patch: PricePatch) => void; onPreview?: () => void; controls?: ReactNode; intro?: ReactNode; more?: ReactNode; taxHint?: string; report?: boolean; fixedPrice?: boolean;
}) {
  const [entered, setEntered] = useState<string | null>(null);
  const project = priceMode === "project", chosen = customerSubtotal ?? lineSubtotal;
  const options = [
    { label: "Itemized", hint: "Show every work line and its price.", materials: false, labor: false },
    { label: "Bundle materials", hint: "Show one materials total; keep labor details.", materials: true, labor: false },
    { label: "Bundle labor", hint: "Show one labor total; keep materials details.", materials: false, labor: true },
    { label: "Bundle everything", hint: "Show one total for labor and one for materials.", materials: true, labor: true },
  ];
  return <section className="customer-version-panel k1-version no-print" aria-label="Customer version">
    <div className="customer-version-panel__top"><h3>Customer version</h3>{customerTotal !== undefined && <strong>Customer total {fmtMoney(customerTotal)}</strong>}</div>
    {controls}
    {!report && (draft ? <>
      <label>Prices<select aria-label="Customer price presentation" value={project ? "Project price" : options.find(o => o.materials === hideMaterials && o.labor === hideLabor)!.label} onChange={e => {
        if (e.target.value === "Project price") { setEntered(null); onChange?.({ priceMode: "project", customerSubtotal: chosen }); }
        else { const option = options.find(o => o.label === e.target.value)!; onChange?.({ priceMode: "lines", hideMaterials: option.materials, hideLabor: option.labor }); }
      }}>{options.map(o => <option key={o.label}>{o.label}</option>)}<option>Project price</option></select></label>
      <small>{project ? "Show one agreed price for the whole project." : options.find(o => o.materials === hideMaterials && o.labor === hideLabor)!.hint}</small>
      <details><summary>Compare price options</summary>{options.map(o => <p key={o.label}><strong>{o.label}</strong><br />{o.hint}</p>)}<p><strong>Project price</strong><br />Show one agreed price for the whole project.</p></details>
      {project && !fixedPrice && <>
        <label>Project price<input aria-label="Project price" type="number" min={0} max={10000000} step="0.01" inputMode="decimal" value={entered ?? chosen.toFixed(2)} onChange={e => { setEntered(e.target.value); if (e.target.value.trim() && validCustomerSubtotal(Number(e.target.value))) onChange?.({ customerSubtotal: Number(e.target.value) }); }} /></label>
        <small>{taxHint}</small>
        {entered !== null && (!entered.trim() || !validCustomerSubtotal(Number(entered))) && <p role="alert">Enter a valid price with at most two decimal places.</p>}
        <details><summary>Internal price adjustment</summary><p>Line items {fmtMoney(lineSubtotal)} · Customer price {fmtMoney(chosen)}</p>{acceptedQuoteSubtotal !== undefined && <p>Accepted quote {fmtMoney(acceptedQuoteSubtotal)}</p>}{savedLineSubtotal !== undefined && savedLineSubtotal !== lineSubtotal && <p>Line items have changed.</p>}<button className="button" onClick={() => { setEntered(null); onChange?.({ customerSubtotal: lineSubtotal }); }}>Reset to line total</button><label>Internal adjustment note<textarea value={adjustmentNote} maxLength={1000} onChange={e => onChange?.({ adjustmentNote: e.target.value })} /></label></details>
      </>}
    </> : <p>{readOnlyRole ? "Your role can view this customer copy." : `${project ? "Project price" : options.find(o => o.materials === hideMaterials && o.labor === hideLabor)!.label} — as sent.`}</p>)}
    {intro && <details><summary>Intro text</summary>{intro}</details>}
    {more && <details><summary>Photos and document details</summary>{more}</details>}
    {onPreview && <button className="button" onClick={onPreview}>Preview what the customer gets</button>}
  </section>;
}
