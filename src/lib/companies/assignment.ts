import { resolveDocumentCompany } from "./companies";

/** Spread onto new records only. Missing/one company means no stored field, including when a client submits one. */
export function companyAssignment(business: { billingCompanies?: unknown } | null | undefined, ...ids: unknown[]): { companyId?: string } {
  const company = resolveDocumentCompany(business, { documentCompanyId: ids[0], jobCompanyId: ids[1], customerCompanyId: ids[2] });
  return company ? { companyId: company.id } : {};
}
