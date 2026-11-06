// Billing companies (2026-11-05; first client: Roof Doctors — RDSF + RCU). One business may invoice under more than
// one legal company: same staff, crews, phone agent and customer list, but each company has its own name, logo,
// address and bank/payment details. Missing or ONE entry = today's behaviour everywhere: no toggle, no filter, no
// badge, no new column. Decisions live in src/lib/companies/companies.ts — never re-derive them in a screen.

export interface BillingCompany {
  /** Stable short id: lowercase a-z, 0-9 and "-", 2–16 chars ("rdsf", "rcu"). Never reused for another company. */
  id: string;
  /** Letterhead / legal name ("Roof Doctors South Florida"). */
  name: string;
  /** What toggles, chips and filters say ("RDSF"). At most 8 characters. */
  shortName: string;
  /** A logo in the business's logo library (LibraryLogo.logoId). Missing = the business's default logo. */
  logoId?: string;
  address?: string;
  phone?: string;
  email?: string;
  /** Printed where the business's license prints today. */
  license?: string;
  /** Fax line on the classic letterhead ("Phone … Fax …"). */
  fax?: string;
  /** This company's website, printed in the document footer. A non-default company never borrows the business's. */
  website?: string;
  /** A short slogan printed above the classic letter header (e.g. "Quality roofing since 1985"). */
  tagline?: string;
  /** How a customer pays THIS company — its own bank account (same meaning as billingPrefs.payInstructions). */
  payInstructions?: string;
  /** Its own https pay page (same meaning as billingPrefs.payLink). */
  payLink?: string;
  /** Exactly one company is the default; none marked = the first entry. */
  isDefault?: boolean;
}

/** Wording a company switch regenerated because it was still the generated default (never staff-edited text). */
export interface DocumentCompanyCopy {
  opening?: string;
  closing?: string;
  thankYou?: string;
  narrative?: string;
}

/** What the company shell needs (bootstrap): present only when the business bills under 2+ companies. */
export interface BootstrapCompany {
  id: string;
  name: string;
  shortName: string;
  isDefault: boolean;
  logoUrl: string | null;
}
