"use client";
import { useEffect, useState } from "react";
import { useBootstrap } from "@/contexts/BootstrapContext";
import { useAuth } from "@/contexts/AuthContext";
import { CompanyProfiles } from "@/components/companies/CompanyProfiles";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { OWNER_COMPANY_FIELDS } from "@/lib/companies/validation";
import type { BillingCompany } from "@/types/company";
import type { LibraryLogo } from "@/types/library";
export function CompaniesSection({ logos }: { logos: LibraryLogo[] }) {
  const { data, refresh } = useBootstrap();
  const { user } = useAuth();
  const multi = (data?.business.companies?.length ?? 0) >= 2;
  const allowed = user?.role === "owner" || user?.role === "staff";
  const [companies, setCompanies] = useState<BillingCompany[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!multi || !allowed) return;
    let active = true;
    fetch("/api/company/companies").then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Could not load companies."); if (active) setCompanies(d.companies); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [multi, allowed]);
  if (!multi || !allowed) return null;
  if (!companies.length) return error ? <InlineNotice message={error} /> : null;
  return <CompanyProfiles companies={companies} logos={logos} readOnly={user?.role !== "owner"} onSave={async next => {
    const patches = next.map(c => ({ id: c.id, ...Object.fromEntries(OWNER_COMPANY_FIELDS.map(k => [k, c[k] ?? ""])) }));
    const res = await fetch("/api/company/companies", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companies: patches }) });
    const d = await res.json(); if (!res.ok) throw new Error(d.error || "Could not save."); setCompanies(d.companies); refresh();
  }} />;
}
