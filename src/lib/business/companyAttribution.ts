// Which billing company an activity row belongs to, without ever inventing one (T-317). Returns null for a
// single-/no-company business and for the default company: callers then write exactly today's shape (no companyId,
// no per-company counter). Only a known, non-default company id comes back.

import { companiesOf, defaultCompany, isMultiCompany } from "@/lib/companies/companies";

type HasCompanies = { billingCompanies?: unknown } | null | undefined;

export function nonDefaultCompanyId(business: HasCompanies, companyId: unknown): string | null {
  if (!isMultiCompany(business)) return null;
  if (typeof companyId !== "string") return null;
  if (!companiesOf(business).some((c) => c.id === companyId)) return null;
  return companyId === defaultCompany(business)?.id ? null : companyId;
}
