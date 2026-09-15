// Pure invoice math (Phase 12, Phase 4) — mirrors src/app/admin/invoices/invoiceFlow.ts's own
// separation of pure/testable logic from the page component. Both the client (a live preview as
// the user edits) and the server (POST builds the draft, PATCH recomputes on every save) import
// computeTotals, so preview and persisted totals can never drift apart.

import type { ParsedUpdate } from "@/types/jobs";
import type { JobInvoice, InvoiceLaborLine, InvoiceMaterialLine, InvoiceOtherLine, JobInvoiceDiscount } from "@/types/invoice";
import type { LibraryPricing } from "@/types/library";
import { lookupLaborRate, lookupUnitPrice } from "@/types/library";
import type { BusinessConfig } from "@/types";
import type { Customer } from "@/types/customer";

const DEFAULT_LABOR_RATE = 65;

// Only the two BusinessConfig fields this module actually reads — a caller (the PATCH/POST
// route) shouldn't have to construct/fetch a whole fake BusinessConfig just to satisfy a wider
// type than the logic needs.
type BusinessConfigDefaults = Pick<BusinessConfig, "laborRate" | "defaultTaxRate">;

function calcHours(arrival?: string, departure?: string): number | undefined {
  if (!arrival || !departure) return undefined;
  const parse = (t: string): number | null => {
    const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ampm = m[3]?.toLowerCase();
    if (ampm === "pm" && h !== 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return h * 60 + min;
  };
  const a = parse(arrival);
  const d = parse(departure);
  if (a == null || d == null) return undefined;
  const diff = d >= a ? d - a : d + 24 * 60 - a; // crosses midnight
  return Math.round((diff / 60) * 100) / 100;
}

let lineSeq = 0;
function lineId(prefix: string): string {
  lineSeq += 1;
  return `${prefix}_${Date.now()}_${lineSeq}`;
}

export interface DraftInput {
  parsed: ParsedUpdate;
  library: LibraryPricing | null;
  businessConfig: BusinessConfigDefaults | null;
  customer?: Customer | null;
}

/**
 * Build a draft's line items from the job's authoritative projection. Rate/price precedence
 * (customer overrides inserted ahead of the platform-wide defaults):
 *   Labor rate:     line.rate -> Library role match -> customer.defaultLaborRate
 *                   -> businessConfig.laborRate.defaultHourlyRate -> 65
 *   Material price: m.cost/qty -> Library item match -> blank, never guessed (the existing
 *                   invariant: an unpriced material must never silently inflate/shrink the total)
 *
 * Deviation from the original spec signature: no separate `punches: WorkerDay[]` input. `parsed`
 * (job.parsed) already has punched labor merged in — buildProjection's own merge rule (Phase 5)
 * lets a punched (workerKey, dayKey) shadow the spoken one entirely, and stamps `source: "punch"`
 * on the surviving line — so re-merging raw punches here would risk applying that shadow rule
 * twice in two different places. `l.source` is read straight through instead.
 */
export function buildDraftFromProjection(
  input: DraftInput,
): Pick<JobInvoice, "labor" | "materials" | "other" | "taxRate"> {
  const { parsed, library, businessConfig, customer } = input;
  const defaultRate = customer?.defaultLaborRate ?? businessConfig?.laborRate?.defaultHourlyRate ?? DEFAULT_LABOR_RATE;

  const labor: InvoiceLaborLine[] = parsed.labor.map((l) => {
    const hours = l.hours ?? calcHours(l.arrivalTime, l.departureTime) ?? 0;
    const catalogRate = library ? lookupLaborRate(library.laborRates, l.description) : null;
    const rate = l.rate ?? catalogRate ?? defaultRate;
    return {
      lineId: lineId("lab"),
      name: l.description,
      arrival: l.arrivalTime,
      departure: l.departureTime,
      hours,
      rate,
      total: Math.round(hours * rate * 100) / 100,
      source: l.source === "punch" ? "punch" : "voice",
      day: l.dayKey,
    };
  });
  if (labor.length === 0) {
    labor.push({ lineId: lineId("lab"), name: "", hours: 0, rate: defaultRate, total: 0, source: "manual" });
  }

  const materials: InvoiceMaterialLine[] = parsed.materials.map((m) => {
    const qty = parseFloat(m.quantity ?? "1") || 1;
    const fromField = m.cost != null ? m.cost / qty : null;
    const fromCatalog = library ? lookupUnitPrice(library.materials, m.item) : null;
    const unitPrice = fromField ?? fromCatalog ?? undefined;
    return {
      lineId: lineId("mat"),
      item: m.item,
      quantity: qty,
      unit: m.unit,
      unitPrice: unitPrice ?? 0,
      total: unitPrice != null ? Math.round(unitPrice * qty * 100) / 100 : 0,
      source: fromField != null ? "voice" : fromCatalog != null ? "catalog" : "manual",
    };
  });

  const taxRate = customer?.defaultTaxRate ?? library?.defaultTaxRate ?? businessConfig?.defaultTaxRate ?? 0;

  return { labor, materials, other: [], taxRate };
}

type TotalsInput = Pick<JobInvoice, "labor" | "materials" | "other" | "taxRate"> & { discount?: JobInvoiceDiscount };
type Totals = Pick<JobInvoice, "laborSubtotal" | "materialSubtotal" | "otherSubtotal" | "subtotal" | "taxAmount" | "total">;

/** O(rows), pure — safe to run on every keystroke with no debounce. */
export function computeTotals(inv: TotalsInput): Totals {
  const laborSubtotal = round2(inv.labor.reduce((s, l) => s + l.total, 0));
  const materialSubtotal = round2(inv.materials.reduce((s, m) => s + m.total, 0));
  const otherSubtotal = round2(inv.other.reduce((s, o) => s + o.amount, 0));
  let subtotal = round2(laborSubtotal + materialSubtotal + otherSubtotal);
  if (inv.discount) {
    const off = inv.discount.kind === "percent" ? subtotal * (inv.discount.value / 100) : inv.discount.value;
    subtotal = round2(Math.max(0, subtotal - off));
  }
  const taxAmount = round2(subtotal * ((inv.taxRate || 0) / 100));
  const total = round2(subtotal + taxAmount);
  return { laborSubtotal, materialSubtotal, otherSubtotal, subtotal, taxAmount, total };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A saved invoice can only be sent once it exists, has no unsaved edits, and has a valid
 *  recipient email — mirrors invoiceFlow.ts's canSendSavedInvoice for the Luxor-billing case. */
export function canSendInvoice(invoiceId: string | null, dirty: boolean, email: string): boolean {
  return Boolean(invoiceId) && !dirty && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
