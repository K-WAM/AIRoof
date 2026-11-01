// The platform's own legal pages (crm.luxordev.com/legal/*) — Luxor ↔ the businesses that use it.
// Not the same thing as src/lib/documents/legalNotices.ts (a contractor's notices to ITS customers).
// Owner decisions 2026-10-30: Florida LLC, AAA arbitration + class waiver, 3-month fee cap, Palm Beach County,
// no-friction acceptance ("By signing in you agree…"). Bump LEGAL_VERSION whenever the Terms or Privacy text
// changes in substance: every sign-in records acceptance of the version current at that moment.
export const LEGAL_VERSION = "2026-11-01";
export const LEGAL_UPDATED = "November 1, 2026";

export const COMPANY = {
  legalName: "Luxor Developments LLC",
  product: "Luxor CRM",
  state: "Florida",
  county: "Palm Beach County, Florida",
  email: "connect@luxordev.com",
  website: "https://www.luxordev.com",
} as const;

export const LEGAL_PATHS = { terms: "/legal/terms", privacy: "/legal/privacy", sms: "/legal/sms" } as const;
