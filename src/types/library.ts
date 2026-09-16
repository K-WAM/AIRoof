// Library: per-business pricing catalog, crews, and shared documents.
// Invoices and reports pull pricing from here; the Calendar Powerboard uses crews.

export interface LibraryMaterial {
  name: string;
  unit: string;
  unitPrice: number;
}

export interface LibraryLaborRate {
  role: string;
  rate: number; // $/hr
}

export interface LibraryDocument {
  docId: string;
  name: string;
  url?: string;        // external link (preferred for anything large — avoids paid storage)
  b64?: string;        // small inline file (capped) for quick uploads
  mimeType?: string;
  uploadedBy?: string;
  createdAt: number;
}

export interface LibraryPricing {
  materials: LibraryMaterial[];
  laborRates: LibraryLaborRate[];
  defaultTaxRate?: number;        // percent
  documents?: LibraryDocument[];
  updatedAt?: number;
}

// Logo library (Phase 12, Phase 4 remainder). A SEPARATE doc from LibraryPricing
// (businesses/{bid}/library/logos, a sibling in the same `library` collection) —
// base64 image data on the pricing doc would bloat a document read on every job
// page. See src/lib/branding/logo.ts for the size caps and rendering rules.
export interface LibraryLogo {
  logoId: string;
  name: string;
  b64: string;          // no `data:` prefix — matches LibraryDocument.b64 precedent
  mimeType: "image/png" | "image/jpeg" | "image/svg+xml" | "image/webp";
  w?: number;
  h?: number;
  // "color": the real mark, natural colors — the default for a white invoice header.
  // "mono-dark"/"mono-light": single-color renditions for a colored brand bar (email
  // header, report cover) where a color logo would otherwise need a filter or a chip.
  variant: "color" | "mono-dark" | "mono-light";
  isDefault?: boolean;
  createdAt: number;
}

export interface Crew {
  crewId: string;
  name: string;
  email?: string;
  phone?: string;
  color: string;       // hex, used for calendar tiles
  active: boolean;
  createdAt: number;
}

// Fuzzy-match a material name to a catalog entry's unit price. Returns null if no confident match.
export function lookupUnitPrice(materials: LibraryMaterial[], item: string): number | null {
  if (!item) return null;
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const target = norm(item);
  // exact, then substring either direction
  const exact = materials.find((m) => norm(m.name) === target);
  if (exact) return exact.unitPrice;
  const partial = materials.find((m) => norm(m.name).includes(target) || target.includes(norm(m.name)));
  return partial ? partial.unitPrice : null;
}

// Same fuzzy match, for a labor row's technician/description against a saved role's $/hr rate
// (e.g. a field note logging "Foreman" matches a "Foreman" role in the Library). A logged
// person's actual name ("Mike") won't match a role and correctly falls through to null — this
// is a same-confidence-bar convenience default, not a guess at who someone is.
export function lookupLaborRate(laborRates: LibraryLaborRate[], description: string): number | null {
  if (!description) return null;
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const target = norm(description);
  const exact = laborRates.find((l) => norm(l.role) === target);
  if (exact) return exact.rate;
  const partial = laborRates.find((l) => norm(l.role) && (target.includes(norm(l.role)) || norm(l.role).includes(target)));
  return partial ? partial.rate : null;
}
