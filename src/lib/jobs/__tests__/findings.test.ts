import { describe, expect, it } from "vitest";
import { copyCatalogFinding, validFindings, addFindingsToInvoice } from "../findings";
import { reportFindingsHtml } from "../reportFindingsHtml";
import type { JobInvoice } from "@/types/invoice";
import type { WorkCatalogItem } from "@/types/workCatalog";

const item: WorkCatalogItem = { itemId: "item-1", category: "Leaks", problem: "Leaking seam", solution: "Seal seam",
  severity: "high", lines: [{ kind: "material", description: "Sealant", quantity: 2, unitPrice: 5 },
    { kind: "labor", description: "Repair", quantity: 1.5, unitPrice: 80 }], createdAt: 1 };
const invoice: JobInvoice = { invoiceId: "INV-1000", businessId: "b", jobId: "j", billTo: { name: "Customer" }, status: "draft",
  labor: [{ lineId: "crew", name: "Crew work", hours: 2, rate: 50, total: 100, source: "voice" }], materials: [], other: [],
  hideMaterials: false, taxRate: 10, laborSubtotal: 100, materialSubtotal: 0, otherSubtotal: 0, subtotal: 100,
  taxAmount: 10, total: 110, createdAt: 1, updatedAt: 1, createdBy: "u" };

describe("job findings", () => {
  it("copies catalog content deeply, then unticking removes only the job snapshot", () => {
    const selected = [copyCatalogFinding(item)];
    item.problem = "Catalog changed";
    item.lines![0].unitPrice = 99;
    expect(selected[0].problem).toBe("Leaking seam");
    expect(selected[0].lines![0].unitPrice).toBe(5);
    expect(selected.filter((f) => f.itemId !== item.itemId)).toEqual([]);
  });
  it("rejects HTML, malformed lines, duplicate IDs and more than 60", () => {
    const finding = copyCatalogFinding(item);
    expect(validFindings([finding])).toBe(true);
    expect(validFindings([{ ...finding, problem: "<script>" }])).toBe(false);
    expect(validFindings([finding, finding])).toBe(false);
    expect(validFindings(Array.from({ length: 61 }, (_, i) => ({ ...finding, findingId: String(i) })))).toBe(false);
  });
  it("renders only included findings and escapes report text", () => {
    const included = { ...copyCatalogFinding(item), problem: "Storm & wind", solution: "Repair & seal" };
    const hidden = { ...copyCatalogFinding(item), includeInReport: false, problem: "Hidden" };
    const html = reportFindingsHtml([included, hidden]);
    expect(html).toContain("Issues found &amp; work performed / recommended");
    expect(html).toContain("Storm &amp; wind");
    expect(html).toContain("Repair &amp; seal");
    expect(html).not.toContain("Hidden");
  });
  it("imports finding lines once, keeps crew rows and uses Library material price with shared totals", () => {
    const finding = copyCatalogFinding({ ...item, lines: [{ kind: "material", description: "Sealant", quantity: 2, unitPrice: 5 },
      { kind: "labor", description: "Repair", quantity: 1.5, unitPrice: 80 }] });
    const one = addFindingsToInvoice(invoice, [finding], { materials: [{ name: "Sealant", unit: "tube", unitPrice: 9 }], laborRates: [] });
    const twice = addFindingsToInvoice(one, [finding], { materials: [], laborRates: [] });
    expect(twice.labor).toHaveLength(2);
    expect(twice.labor[0]).toEqual(invoice.labor[0]);
    expect(twice.materials).toHaveLength(1);
    expect(twice.materials[0].unitPrice).toBe(9);
    expect(twice.subtotal).toBe(238);
    expect(twice.total).toBe(261.8);
    expect(addFindingsToInvoice({ ...invoice, status: "sent" }, [finding], null).materials).toEqual([]);
  });
});
