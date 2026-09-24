// Document options (Phase 18, T-107) — SHARED CONTRACT for the customer-facing documents (invoice, quote,
// report). Integrator-owned: extend with OPTIONAL fields only.
//
// Semantics (same for the in-app view, print/PDF and the emailed HTML of EVERY document):
//  - hideMaterials: materials collapse to ONE lump "Materials" subtotal row (never nothing — the totals stay
//    truthful). This is what the reference invoice ("Roof Doctor's Invoice.pdf") shows.
//  - hideLabor:     labor collapses to ONE lump "Labor" subtotal row — no worker names, hours or rates.
//  - showPhotos:    include the photos the user marked "in report" (photo pages).
//  - showTechnicians: print the chosen technician names in the document's meta block.
// The EDITOR always shows every row; these options control the CUSTOMER COPY (preview, print, email).
//
// Persistence: invoice and quote keep the existing top-level `hideMaterials` boolean and gain optional
// top-level `hideLabor`, `showPhotos`, `showTechnicians`; the report stores `Job.reportOptions`.
// A missing field means the default below.

export interface DocumentOptions {
  hideMaterials: boolean;
  hideLabor: boolean;
  showPhotos: boolean;
  showTechnicians: boolean;
}

export const DEFAULT_DOCUMENT_OPTIONS: DocumentOptions = {
  hideMaterials: false,
  hideLabor: false,
  showPhotos: true,
  showTechnicians: false,
};

export function normalizeDocumentOptions(raw?: Partial<DocumentOptions> | null): DocumentOptions {
  return {
    hideMaterials: raw?.hideMaterials === true,
    hideLabor: raw?.hideLabor === true,
    showPhotos: raw?.showPhotos === undefined ? DEFAULT_DOCUMENT_OPTIONS.showPhotos : raw.showPhotos === true,
    showTechnicians: raw?.showTechnicians === true,
  };
}
