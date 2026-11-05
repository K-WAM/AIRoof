"use client";
import { useState } from "react";
import { useBootstrap } from "@/contexts/BootstrapContext";
import { resolveDocumentCompany } from "@/lib/companies/companies";
import { CompanyToggle } from "./CompanyToggle";
import { InlineNotice } from "@/components/ui/InlineNotice";

export function DocumentCompanyControl({ jobId, kind, companyId, jobCompanyId, customerCompanyId, invoiceId, sent, disabled, onSaved }: {
  jobId: string; kind: "quote" | "invoice" | "deposit" | "report"; companyId?: string; jobCompanyId?: string; customerCompanyId?: string; invoiceId?: string;
  sent?: boolean; disabled?: boolean; onSaved: (id: string) => void;
}) {
  const companies = useBootstrap().data?.business.companies;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!companies || companies.length < 2) return null;
  const selected = resolveDocumentCompany({ billingCompanies: companies }, { documentCompanyId: companyId, jobCompanyId, customerCompanyId });
  return <div className="no-print"><CompanyToggle companies={companies} value={selected?.id} readOnly={sent} disabled={disabled || busy} onChange={async id => {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/jobs/${jobId}/company`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, companyId: id, ...(invoiceId ? { invoiceId } : {}) }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || "Could not change company."); onSaved(id);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not change company."); } finally { setBusy(false); }
  }} />{error && <InlineNotice message={error} />}</div>;
}
