"use client";

import { useState } from "react";
import { validCustomerSubtotal } from "@/lib/billing/jobCustomerTotals";

export function CustomerVersionPanel({ draft, readOnlyRole = false, priceMode = "lines", hideMaterials, hideLabor, lineSubtotal, savedLineSubtotal, customerSubtotal, customerTotal, adjustmentNote = "", acceptedQuoteSubtotal, onChange, onPreview }: {
  draft: boolean;
  readOnlyRole?: boolean;
  priceMode?: "lines" | "project";
  hideMaterials: boolean;
  hideLabor: boolean;
  lineSubtotal: number;
  savedLineSubtotal?: number;
  customerSubtotal?: number;
  customerTotal: number;
  adjustmentNote?: string;
  acceptedQuoteSubtotal?: number;
  onChange: (patch: { priceMode?: "lines" | "project"; hideMaterials?: boolean; hideLabor?: boolean; customerSubtotal?: number; adjustmentNote?: string }) => void;
  onPreview: () => void;
}) {
  const [enteredPrice, setEnteredPrice] = useState<string | null>(null);
  const project = priceMode === "project";
  const chosen = customerSubtotal ?? lineSubtotal;
  const changed = project && savedLineSubtotal !== undefined && savedLineSubtotal !== lineSubtotal;
  return <section className="customer-version-panel no-print" aria-label="Customer version">
    <div className="customer-version-panel__top"><h3>Customer version</h3><strong>Customer total ${customerTotal.toFixed(2)}</strong></div>
    {draft ? <>
      <div className="segmented-control" aria-label="Customer price presentation">
        <button type="button" className="segment" aria-pressed={!project && !hideMaterials} onClick={() => onChange({ priceMode: "lines", hideMaterials: false })}>Itemized</button>
        <button type="button" className="segment" aria-pressed={!project && hideMaterials} onClick={() => onChange({ priceMode: "lines", hideMaterials: true })}>Bundle materials</button>
        <button type="button" className="segment" aria-pressed={project} onClick={() => { setEnteredPrice(null); onChange({ priceMode: "project", customerSubtotal: chosen }); }}>Project price</button>
      </div>
      {!project && <label className="customer-version-panel__check"><input type="checkbox" checked={hideLabor} onChange={(event) => onChange({ hideLabor: event.target.checked })} /> Also bundle labor</label>}
      <p>This controls what your customer receives; your line items stay visible only to your team.</p>
      {project && <>
        <label>Project price before tax <input type="number" min="0" max="10000000" step="0.01" inputMode="decimal" value={enteredPrice ?? chosen.toFixed(2)} onBlur={() => { if (enteredPrice !== null && (!enteredPrice.trim() || !validCustomerSubtotal(Number(enteredPrice)))) setEnteredPrice(null); }} onChange={(event) => {
          setEnteredPrice(event.target.value);
          const amount = Number(event.target.value);
          if (event.target.value.trim() && validCustomerSubtotal(amount)) onChange({ customerSubtotal: amount });
        }} /></label>
        {enteredPrice !== null && (!enteredPrice.trim() || !validCustomerSubtotal(Number(enteredPrice))) && <p role="alert">Enter a price from $0 to $10,000,000 with no more than two decimal places.</p>}
        <div className="customer-version-panel__internal">Line items ${lineSubtotal.toFixed(2)} · Price adjustment {chosen - lineSubtotal < 0 ? "−" : "+"}${Math.abs(chosen - lineSubtotal).toFixed(2)} · Customer price ${chosen.toFixed(2)}</div>
        {acceptedQuoteSubtotal !== undefined && <p>Accepted quote ${acceptedQuoteSubtotal.toFixed(2)} · actual line items ${lineSubtotal.toFixed(2)}</p>}
        {changed && <p role="status">Line items changed to ${lineSubtotal.toFixed(2)} — Reset customer price?</p>}
        <button type="button" className="button" onClick={() => { setEnteredPrice(null); onChange({ customerSubtotal: lineSubtotal }); }}>Reset to line total</button>
        <label>Internal adjustment note (customer cannot see this)<textarea value={adjustmentNote} maxLength={1000} onChange={(event) => onChange({ adjustmentNote: event.target.value })} /></label>
      </>}
    </> : <p>{readOnlyRole ? "You can view this customer version but cannot change it with your role." : `This ${project ? "project price" : hideMaterials ? "bundled materials" : "itemized"} version is locked. Create a new quote after talking to the customer.`}</p>}
    <button type="button" className="button" onClick={onPreview}>Preview what the customer gets</button>
  </section>;
}
