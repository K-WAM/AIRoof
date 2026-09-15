import { describe, it, expect } from "vitest";
import { buildDraftFromProjection, computeTotals, canSendInvoice } from "../jobInvoice";
import type { ParsedUpdate } from "@/types/jobs";
import type { LibraryPricing } from "@/types/library";
import type { BusinessConfig } from "@/types";
import type { Customer } from "@/types/customer";

function parsed(overrides: Partial<ParsedUpdate> = {}): ParsedUpdate {
  return { timeline: [], materials: [], labor: [], issues: [], invoiceSuggestions: [], ...overrides };
}

const emptyLibrary: LibraryPricing = { materials: [], laborRates: [] };

describe("buildDraftFromProjection — labor rate precedence", () => {
  it("uses the line's own explicit rate first", () => {
    const draft = buildDraftFromProjection({
      parsed: parsed({ labor: [{ description: "Kevin", hours: 4, rate: 90 }] }),
      library: emptyLibrary, businessConfig: null, customer: null,
    });
    expect(draft.labor[0].rate).toBe(90);
    expect(draft.labor[0].total).toBe(360);
  });

  it("falls back to a Library role match when the line has no rate", () => {
    const draft = buildDraftFromProjection({
      parsed: parsed({ labor: [{ description: "Foreman", hours: 2 }] }),
      library: { materials: [], laborRates: [{ role: "Foreman", rate: 75 }] },
      businessConfig: null, customer: null,
    });
    expect(draft.labor[0].rate).toBe(75);
  });

  it("falls back to the customer's default rate ahead of the business default", () => {
    const draft = buildDraftFromProjection({
      parsed: parsed({ labor: [{ description: "Kevin", hours: 2 }] }),
      library: emptyLibrary,
      businessConfig: { laborRate: { defaultHourlyRate: 65 } } as BusinessConfig,
      customer: { defaultLaborRate: 80 } as Customer,
    });
    expect(draft.labor[0].rate).toBe(80);
  });

  it("falls all the way back to the hardcoded $65 default", () => {
    const draft = buildDraftFromProjection({
      parsed: parsed({ labor: [{ description: "Kevin", hours: 1 }] }),
      library: emptyLibrary, businessConfig: null, customer: null,
    });
    expect(draft.labor[0].rate).toBe(65);
  });

  it("adds one blank manual row when there is no labor at all", () => {
    const draft = buildDraftFromProjection({ parsed: parsed(), library: emptyLibrary, businessConfig: null, customer: null });
    expect(draft.labor).toHaveLength(1);
    expect(draft.labor[0].source).toBe("manual");
  });

  it("preserves punch provenance from the already-merged projection rather than re-deriving it", () => {
    const draft = buildDraftFromProjection({
      parsed: parsed({ labor: [{ description: "Kevin", hours: 8, rate: 65, source: "punch", dayKey: "2026-09-14" }] }),
      library: emptyLibrary, businessConfig: null, customer: null,
    });
    expect(draft.labor[0].source).toBe("punch");
    expect(draft.labor[0].day).toBe("2026-09-14");
  });
});

describe("buildDraftFromProjection — material price precedence", () => {
  it("never guesses a price when nothing matches — leaves it blank (zero), not fabricated", () => {
    const draft = buildDraftFromProjection({
      parsed: parsed({ materials: [{ item: "Mystery widget", quantity: "3" }] }),
      library: emptyLibrary, businessConfig: null, customer: null,
    });
    expect(draft.materials[0].unitPrice).toBe(0);
    expect(draft.materials[0].source).toBe("manual");
  });

  it("prefers an explicit field cost over the catalog", () => {
    const draft = buildDraftFromProjection({
      parsed: parsed({ materials: [{ item: "Shingles", quantity: "2", cost: 100 }] }),
      library: { materials: [{ name: "Shingles", unit: "sq", unitPrice: 999 }], laborRates: [] },
      businessConfig: null, customer: null,
    });
    expect(draft.materials[0].unitPrice).toBe(50); // 100 / 2
    expect(draft.materials[0].source).toBe("voice");
  });

  it("falls back to the catalog when the field note has no cost", () => {
    const draft = buildDraftFromProjection({
      parsed: parsed({ materials: [{ item: "Nails", quantity: "1" }] }),
      library: { materials: [{ name: "Nails", unit: "box", unitPrice: 12.5 }], laborRates: [] },
      businessConfig: null, customer: null,
    });
    expect(draft.materials[0].unitPrice).toBe(12.5);
    expect(draft.materials[0].source).toBe("catalog");
  });
});

describe("buildDraftFromProjection — tax rate precedence", () => {
  it("customer override beats the library default beats the business default beats zero", () => {
    expect(buildDraftFromProjection({
      parsed: parsed(), library: { materials: [], laborRates: [], defaultTaxRate: 5 } as LibraryPricing,
      businessConfig: { defaultTaxRate: 7 } as BusinessConfig, customer: { defaultTaxRate: 9 } as Customer,
    }).taxRate).toBe(9);
    expect(buildDraftFromProjection({
      parsed: parsed(), library: { materials: [], laborRates: [], defaultTaxRate: 5 } as LibraryPricing,
      businessConfig: { defaultTaxRate: 7 } as BusinessConfig, customer: null,
    }).taxRate).toBe(5);
    expect(buildDraftFromProjection({
      parsed: parsed(), library: emptyLibrary, businessConfig: { defaultTaxRate: 7 } as BusinessConfig, customer: null,
    }).taxRate).toBe(7);
    expect(buildDraftFromProjection({
      parsed: parsed(), library: emptyLibrary, businessConfig: null, customer: null,
    }).taxRate).toBe(0);
  });
});

describe("computeTotals", () => {
  it("sums labor + materials + other, then applies tax to the subtotal", () => {
    const totals = computeTotals({
      labor: [{ lineId: "l1", name: "Kevin", hours: 4, rate: 50, total: 200, source: "manual" }],
      materials: [{ lineId: "m1", item: "Nails", quantity: 1, unitPrice: 20, total: 20, source: "manual" }],
      other: [{ lineId: "o1", description: "Disposal fee", amount: 30 }],
      taxRate: 10,
    });
    expect(totals).toEqual({
      laborSubtotal: 200, materialSubtotal: 20, otherSubtotal: 30,
      subtotal: 250, taxAmount: 25, total: 275,
    });
  });

  it("applies a percent discount before tax", () => {
    const totals = computeTotals({
      labor: [{ lineId: "l1", name: "Kevin", hours: 1, rate: 100, total: 100, source: "manual" }],
      materials: [], other: [], taxRate: 10,
      discount: { kind: "percent", value: 10 },
    });
    expect(totals.subtotal).toBe(90); // 100 - 10%
    expect(totals.taxAmount).toBe(9);
    expect(totals.total).toBe(99);
  });

  it("clamps a discount larger than the subtotal to zero, never negative", () => {
    const totals = computeTotals({
      labor: [], materials: [], other: [{ lineId: "o1", description: "x", amount: 10 }], taxRate: 0,
      discount: { kind: "amount", value: 999 },
    });
    expect(totals.subtotal).toBe(0);
    expect(totals.total).toBe(0);
  });
});

describe("canSendInvoice", () => {
  it("requires a saved invoice id, no unsaved edits, and a valid email", () => {
    expect(canSendInvoice("INV-1000", false, "a@b.com")).toBe(true);
    expect(canSendInvoice(null, false, "a@b.com")).toBe(false);
    expect(canSendInvoice("INV-1000", true, "a@b.com")).toBe(false);
    expect(canSendInvoice("INV-1000", false, "not-an-email")).toBe(false);
  });
});
