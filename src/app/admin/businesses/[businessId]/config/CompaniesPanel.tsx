"use client";
import { useEffect, useState } from "react";
import { CompanyProfiles } from "@/components/companies/CompanyProfiles";
import { InlineNotice } from "@/components/ui/InlineNotice";
import type { BillingCompany } from "@/types/company";
import type { LibraryLogo } from "@/types/library";
export function CompaniesPanel({ businessId }: { businessId: string }) {
  const [data, setData] = useState<{ companies: BillingCompany[]; logos: LibraryLogo[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; fetch(`/api/admin/businesses/${businessId}/companies`).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Could not load companies."); if (active) setData(d); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [businessId]);
  if (!data) return error ? <InlineNotice message={error} /> : null;
  return <CompaniesPanelForm businessId={businessId} data={data} onChange={setData} />;
}
function CompaniesPanelForm({ businessId, data, onChange }: { businessId: string; data: { companies: BillingCompany[]; logos: LibraryLogo[] }; onChange: (d: typeof data) => void }) {
  return <CompanyProfiles companies={data.companies} logos={data.logos} admin onSave={async companies => {
    const res = await fetch(`/api/admin/businesses/${businessId}/companies`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companies }) });
    const next = await res.json(); if (!res.ok) throw new Error(next.error || "Could not save."); onChange({ ...data, companies: next.companies });
  }} />;
}
