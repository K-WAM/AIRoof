"use client";
import { Check } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { BootstrapCompany } from "@/types/company";

/** The only company switch. Callers omit the field/payload entirely when bootstrap has no companies. */
export function CompanyToggle({ companies, value, onChange, readOnly, disabled, label, ariaLabel = "Company" }: {
  companies?: readonly BootstrapCompany[];
  value?: string | null;
  onChange?: (id: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
  /** Visible text before the switch, e.g. "Company" on the job header. */
  label?: string;
  ariaLabel?: string;
}) {
  if (!companies || companies.length < 2) return null;
  const selected = companies.find(c => c.id === value) ?? companies.find(c => c.isDefault) ?? companies[0];
  if (readOnly) return <span className="text-muted">Sent as {selected.shortName}</span>;
  function keyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % companies!.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index + companies!.length - 1) % companies!.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = companies!.length - 1;
    else return;
    e.preventDefault();
    const buttons = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[next].focus();
    if (companies![next].id !== selected.id) onChange?.(companies![next].id);
  }
  return <div className="company-toggle no-print">
    {label && <span className="company-toggle__label">{label}</span>}
    <div role="radiogroup" aria-label={ariaLabel}>
    {companies.map((c, i) => <button key={c.id} type="button" className="button small ghost" role="radio" aria-checked={c.id === selected.id} tabIndex={c.id === selected.id ? 0 : -1} disabled={disabled} onKeyDown={e => keyDown(e, i)} onClick={() => { if (c.id !== selected.id) onChange?.(c.id); }}>
      {/* Inline library data URIs do not benefit from image optimization. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {c.logoUrl && <img src={c.logoUrl} alt="" />}<span>{c.shortName}</span><Check size={15} aria-hidden="true" style={{ visibility: c.id === selected.id ? "visible" : "hidden" }} />
    </button>)}
    </div>
  </div>;
}
