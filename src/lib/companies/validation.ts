import type { BillingCompany } from "@/types/company";
import { MAX_COMPANIES } from "./companies";

export const COMPANY_LIMITS = { id: 16, name: 160, shortName: 8, logoId: 120, address: 500, phone: 40, fax: 40, email: 200, website: 200, license: 120, tagline: 120, payInstructions: 2000, payLink: 500 } as const;
export const OWNER_COMPANY_FIELDS = ["address", "phone", "fax", "email", "website", "license", "tagline", "payInstructions", "payLink", "logoId"] as const;

/** Reject rather than silently truncate legal names, bank details or payment URLs. Never accepts logo data/URLs. */
export function validateCompanies(raw: unknown, logoIds: readonly string[]): { companies: BillingCompany[]; error?: never } | { error: string; companies?: never } {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_COMPANIES) return { error: `Use 1 to ${MAX_COMPANIES} companies.` };
  const companies: BillingCompany[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return { error: "Each company must be an object." };
    const c: Record<string, unknown> = {};
    for (const [key, limit] of Object.entries(COMPANY_LIMITS)) {
      const value = entry[key];
      if (value === undefined) continue;
      if (typeof value !== "string") return { error: `${key} must be text.` };
      const text = value.trim();
      if (text.length > limit) return { error: `${key} must be at most ${limit} characters.` };
      if (text) c[key] = text;
    }
    if (typeof c.id !== "string" || !/^[a-z0-9-]{2,16}$/.test(c.id) || seen.has(c.id)) return { error: "Use a unique company id: 2-16 lowercase letters, numbers or hyphens." };
    if (!c.name || !c.shortName) return { error: "Company name and short name are required." };
    if (c.logoId && !logoIds.includes(c.logoId as string)) return { error: "Choose a logo from this business's logo library." };
    if (c.payLink) {
      try { const url = new URL(c.payLink as string); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); }
      catch { return { error: "Pay link must be an HTTPS URL." }; }
    }
    if (entry.isDefault !== undefined && typeof entry.isDefault !== "boolean") return { error: "Default must be true or false." };
    c.isDefault = entry.isDefault === true;
    seen.add(c.id);
    companies.push(c as unknown as BillingCompany);
  }
  if (companies.filter(c => c.isDefault).length !== 1) return { error: "Choose exactly one default company." };
  return { companies };
}

/** Owners may edit branding/payment details, never identity, count, order or default. */
export function patchCompanyProfiles(current: BillingCompany[], raw: unknown): BillingCompany[] | null {
  if (!Array.isArray(raw) || raw.length !== current.length) return null;
  const ids = new Set<string>();
  for (const c of raw) {
    if (!c || typeof c !== "object" || !current.some(x => x.id === c.id) || ids.has(c.id)) return null;
    if (Object.keys(c).some(k => k !== "id" && !OWNER_COMPANY_FIELDS.includes(k as typeof OWNER_COMPANY_FIELDS[number]))) return null;
    ids.add(c.id);
  }
  return current.map(c => ({ ...c, ...raw.find(x => x.id === c.id) }));
}
