import type { BusinessConfig } from "@/types";
import type { BillingCompany } from "@/types/company";
import type { LibraryLogo } from "@/types/library";
import { resolveLetterhead, type Letterhead, type LetterheadBusiness } from "@/lib/documents/letterhead";
import { defaultCompany } from "./companies";

/**
 * One overlay for every preview, print/PDF and email. The DEFAULT company keeps the business's own contact,
 * license and payment values as its fallback (today's behavior). Any other company prints only its own details:
 * a blank field is omitted, never borrowed from the business or the default company — an RCU invoice must never
 * show RDSF's bank account.
 */
export function documentLetterhead<T extends LetterheadBusiness & { billingPrefs?: BusinessConfig["billingPrefs"] }>(business: T, company: BillingCompany | null, logos: LibraryLogo[] = [], logoId?: string | null): T & Letterhead & { billingPrefs?: BusinessConfig["billingPrefs"] } {
  if (!company) return { ...business, ...resolveLetterhead(business, logos, "light", logoId) };
  const isDefault = defaultCompany(business as { billingCompanies?: unknown })?.id === company.id;
  const brand = {
    ...business,
    businessName: company.name,
    ...(isDefault ? {} : { logoUrl: undefined }),
    address: isDefault ? company.address ?? business.address : company.address,
    contactPhone: isDefault ? company.phone ?? business.contactPhone : company.phone,
    contactEmail: isDefault ? company.email ?? business.contactEmail : company.email,
    licenseNumber: isDefault ? company.license ?? business.licenseNumber : company.license,
    billingPrefs: {
      ...business.billingPrefs,
      payInstructions: isDefault ? company.payInstructions ?? business.billingPrefs?.payInstructions ?? "" : company.payInstructions ?? "",
      payLink: isDefault ? company.payLink ?? business.billingPrefs?.payLink ?? "" : company.payLink ?? "",
    },
  };
  // A non-default company with no logo of its own prints no logo (never the business's or the default's).
  return { ...brand, ...resolveLetterhead(brand, logos, "light", isDefault ? company.logoId : company.logoId ?? null) };
}
