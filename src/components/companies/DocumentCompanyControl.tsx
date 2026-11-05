"use client";
import { useState } from "react";
import { useBootstrap } from "@/contexts/BootstrapContext";
import { resolveDocumentCompany } from "@/lib/companies/companies";
import { InlineNotice } from "@/components/ui/InlineNotice";
import type { DocumentCompanyCopy } from "@/types/company";

/**
 * A document's small issuer label: "Issued as RCU · Change" opens a menu (one company for THIS document only).
 * It is deliberately not a switch/radiogroup — the job header owns the one company switch on the screen.
 * Sent documents are frozen and only say "Sent as RCU".
 */
export function DocumentCompanyControl({ jobId, kind, companyId, jobCompanyId, customerCompanyId, invoiceId, sent, disabled, onSaved }: {
  jobId: string; kind: "quote" | "invoice" | "deposit" | "report"; companyId?: string; jobCompanyId?: string; customerCompanyId?: string; invoiceId?: string;
  sent?: boolean; disabled?: boolean; onSaved: (id: string, copy?: DocumentCompanyCopy) => void;
}) {
  const companies = useBootstrap().data?.business.companies;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!companies || companies.length < 2) return null;
  const selected = resolveDocumentCompany({ billingCompanies: companies }, { documentCompanyId: companyId, jobCompanyId, customerCompanyId, documentStatus: sent ? "sent" : "draft" });
  if (sent) return <span className="text-muted no-print">Sent as {selected?.shortName}</span>;
  async function choose(id: string) {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/jobs/${jobId}/company`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, companyId: id, ...(invoiceId ? { invoiceId } : {}) }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || "Could not change company."); onSaved(id, d.copy);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not change company."); } finally { setBusy(false); }
  }
  return <div className="no-print document-company-control">
    <button type="button" className="company-issuer" aria-haspopup="menu" aria-expanded={open} disabled={disabled || busy} onClick={() => setOpen(value => !value)}>
      Issued as {selected?.shortName} · <span className="company-issuer__change">Change</span>
    </button>
    {open && <div className="company-issuer__menu" role="menu" aria-label="Company for this document">
      {companies.map(company => <button key={company.id} type="button" role="menuitem" onClick={() => { setOpen(false); if (company.id !== selected?.id) void choose(company.id); }}>
        {company.shortName} · {company.name}
      </button>)}
    </div>}
    {error && <InlineNotice message={error} />}
  </div>;
}
