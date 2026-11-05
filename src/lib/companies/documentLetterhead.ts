import type { BusinessConfig } from "@/types";
import type { BillingCompany } from "@/types/company";
import type { LibraryLogo } from "@/types/library";
import { resolveLetterhead, type Letterhead, type LetterheadBusiness } from "@/lib/documents/letterhead";

/** One overlay for every preview, print/PDF and email. */
export function documentLetterhead<T extends LetterheadBusiness & { billingPrefs?: BusinessConfig["billingPrefs"] }>(business: T, company: BillingCompany | null, logos: LibraryLogo[] = [], logoId?: string | null): T & Letterhead & { billingPrefs?: BusinessConfig["billingPrefs"] } {
  if (!company) return { ...business, ...resolveLetterhead(business, logos, "light", logoId) };
  const brand = {
    ...business,
    businessName: company.name,
    address: company.address ?? business.address,
    contactPhone: company.phone ?? business.contactPhone,
    contactEmail: company.email ?? business.contactEmail,
    licenseNumber: company.license ?? business.licenseNumber,
    billingPrefs: { ...business.billingPrefs, payInstructions: company.payInstructions ?? business.billingPrefs?.payInstructions ?? "", payLink: company.payLink ?? business.billingPrefs?.payLink ?? "" },
  };
  return { ...brand, ...resolveLetterhead(brand, logos, "light", company.logoId) };
}
