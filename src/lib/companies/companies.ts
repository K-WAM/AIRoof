// The ONE place that decides which billing company something belongs to (src/types/company.ts). Pure; shared by the
// server (documents, money, usage) and the client (toggle, chips, filters). Single- or no-company businesses: every
// company UI is hidden and documents render exactly as before (resolveDocumentCompany returns null).

import type { BillingCompany } from "@/types/company";

export const MAX_COMPANIES = 4;
const ID = /^[a-z0-9-]{2,16}$/;

type HasCompanies = { billingCompanies?: unknown } | null | undefined;

/** The business's valid companies, in order. Malformed entries and repeated ids are dropped; at most MAX_COMPANIES. */
export function companiesOf(business: HasCompanies): BillingCompany[] {
  const raw = business?.billingCompanies;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: BillingCompany[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const c = entry as BillingCompany;
    if (typeof c.id !== "string" || !ID.test(c.id) || seen.has(c.id)) continue;
    if (typeof c.name !== "string" || !c.name.trim() || typeof c.shortName !== "string" || !c.shortName.trim()) continue;
    seen.add(c.id);
    out.push(c);
    if (out.length === MAX_COMPANIES) break;
  }
  return out;
}

/** The only switch for every company toggle, chip, filter, column and split: 2+ valid companies. */
export function isMultiCompany(business: HasCompanies): boolean {
  return companiesOf(business).length >= 2;
}

export function defaultCompany(business: HasCompanies): BillingCompany | null {
  const list = companiesOf(business);
  return list.find((c) => c.isDefault === true) ?? list[0] ?? null;
}

/** A known company id as given, else the default company's id; null when the business has no companies. */
export function effectiveCompanyId(business: HasCompanies, id: unknown): string | null {
  if (typeof id === "string" && companiesOf(business).some((c) => c.id === id)) return id;
  return defaultCompany(business)?.id ?? null;
}

export function companyById(business: HasCompanies, id: unknown): BillingCompany | null {
  const effective = effectiveCompanyId(business, id);
  return companiesOf(business).find((c) => c.id === effective) ?? null;
}

/**
 * The company a document is issued under: the document's own (a staff override, or the snapshot frozen when it was
 * sent), else its job's, else its customer's, else the default. Null for single-/no-company businesses — callers
 * then render exactly as today.
 */
export function resolveDocumentCompany(
  business: HasCompanies,
  ids: { documentCompanyId?: unknown; jobCompanyId?: unknown; customerCompanyId?: unknown; documentStatus?: unknown },
): BillingCompany | null {
  if (!isMultiCompany(business)) return null;
  const known = companiesOf(business);
  const own = typeof ids.documentCompanyId === "string" ? known.find((c) => c.id === ids.documentCompanyId) : undefined;
  if (own) return own;
  // A document that is no longer a draft is frozen: with no company of its own it belongs to the DEFAULT company,
  // never to whatever company the job is switched to today.
  if (typeof ids.documentStatus === "string" && ids.documentStatus !== "draft") return defaultCompany(business);
  for (const id of [ids.jobCompanyId, ids.customerCompanyId]) {
    const hit = typeof id === "string" ? known.find((c) => c.id === id) : undefined;
    if (hit) return hit;
  }
  return defaultCompany(business);
}
