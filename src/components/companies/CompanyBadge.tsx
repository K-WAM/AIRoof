// The one small "which company" label for lists (customers, jobs, calendar, pipeline, money rows). It shows ONLY for a
// non-default company of a multi-company business, so single-company screens and everyday (default) work stay as they
// are. Uses the app's existing neutral `.tag` style — no new colours.

import type { BootstrapCompany } from "@/types/company";

export function companyBadgeLabel(companies: readonly BootstrapCompany[] | undefined, companyId: unknown): string | null {
  if (!companies || companies.length < 2 || typeof companyId !== "string") return null;
  const hit = companies.find((c) => c.id === companyId);
  return hit && !hit.isDefault ? hit.shortName : null;
}

export function CompanyBadge({ companies, companyId }: { companies: readonly BootstrapCompany[] | undefined; companyId: unknown }) {
  const label = companyBadgeLabel(companies, companyId);
  if (!label) return null;
  return <span className="tag" title={`Billed as ${label}`}>{label}</span>;
}
