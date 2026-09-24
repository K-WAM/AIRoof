// Work catalog (Phase 17, T-105): a tenant-editable library of generic findings ("problems") and their
// standard resolutions ("solutions"), optionally with suggested priced lines. On a job the user ticks the
// ones that apply and they flow into the Report, the Invoice, or a Quote.
//
// THIS FILE IS THE SHARED CONTRACT between the Library side (owns the catalog, its API and starter content)
// and the job side (owns findings-on-a-job, report/invoice/quote integration). Neither side may change these
// shapes without the integrator — extend with OPTIONAL fields only.
//
// Storage: businesses/{businessId}/library/workCatalog  (a sibling of library/pricing and library/logos —
// its own doc so a big catalog never bloats the pricing doc read on every job page). Cap: 300 items
// (Firestore 1 MB doc limit, and a catalog longer than that is unusable in a checklist anyway).

export const WORK_CATALOG_MAX_ITEMS = 300;

export type WorkSeverity = "low" | "medium" | "high";

/** A suggested priced line a solution carries into a quote / invoice. */
export interface WorkCatalogLine {
  description: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  kind: "material" | "labor" | "other";
}

export interface WorkCatalogItem {
  /** Stable id: "starter-<vertical>-<slug>" for seeded items, a uuid for tenant-created ones. */
  itemId: string;
  /** Free-text grouping shown as a section in the checklist, e.g. "Leaks", "Flashing". */
  category: string;
  /** The generic finding, e.g. "Cracked or lifted flashing". Plain text. */
  problem: string;
  /** The standard resolution wording that auto-fills the report/quote, e.g. "Remove and replace flashing…". */
  solution: string;
  severity?: WorkSeverity;
  /** Optional suggested lines (prices are EXAMPLES until the tenant reviews them — see `starter`). */
  lines?: WorkCatalogLine[];
  /** Seeded by a starter kit and not yet reviewed by the tenant; cleared on the first edit. */
  starter?: boolean;
  createdAt: number;
}

export interface WorkCatalog {
  items: WorkCatalogItem[];
  /** Starter itemIds ever imported — so a deleted starter item is never silently re-added. */
  starterKitImported?: string[];
  updatedAt?: number;
}

/**
 * A finding SNAPSHOT stored on a job (Job.findings). Always a COPY of the catalog item at the moment it was
 * ticked (or a one-off written on the job): later catalog edits/deletions must never change a report, quote or
 * invoice that already used it — the same point-in-time-snapshot rule as Job.clientName.
 */
export interface JobFinding {
  findingId: string;
  /** Catalog item this was copied from; absent for a finding written directly on the job. */
  itemId?: string;
  category: string;
  problem: string;
  solution: string;
  severity?: WorkSeverity;
  lines?: WorkCatalogLine[];
  /** Per-job toggles: the same ticked finding can appear in the report, the quote, both, or neither. */
  includeInReport: boolean;
  includeInQuote: boolean;
  addedAt: number;
}
