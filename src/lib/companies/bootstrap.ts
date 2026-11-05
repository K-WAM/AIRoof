import type { BootstrapCompany } from "@/types/company";
import type { LibraryLogo } from "@/types/library";
import { companiesOf, defaultCompany, isMultiCompany } from "./companies";
import { resolveLetterhead } from "@/lib/documents/letterhead";

/** Reuses the logo library's data URI mechanism; single-company callers need no library read. */
export function bootstrapCompanies(business: { billingCompanies?: unknown; logoUrl?: string | null }, logos: LibraryLogo[] = []): { companies?: BootstrapCompany[] } {
  if (!isMultiCompany(business)) return {};
  const defaultId = defaultCompany(business)?.id;
  return { companies: companiesOf(business).map(c => ({ id: c.id, name: c.name, shortName: c.shortName, isDefault: c.id === defaultId, logoUrl: resolveLetterhead(business, logos, "light", c.logoId).logoUrl ?? null })) };
}
