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
