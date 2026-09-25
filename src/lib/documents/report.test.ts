import { describe, expect, it } from "vitest";
import { draftNarrative, pairReportPhotos, reportSections } from "./report";
import { buildJobReportEmailHtml } from "@/lib/billing/jobReportEmailHtml";

const parsed = {
  timeline: [{ description: "Removed damaged flashing" }],
  materials: [{ item: "Flashing", quantity: "2", unit: "pcs", cost: 40 }],
  labor: [{ description: "Ava", hours: 2, rate: 75 }],
  issues: [{ description: "Damaged flashing", severity: "high" as const }],
  invoiceSuggestions: [],
};

describe("report document helpers", () => {
  it("lists labor and materials as plain facts with no prices", () => {
    const sections = reportSections(parsed);
    expect(sections).toEqual([
      { title: "Labor", lines: ["Ava — 2 h"] },
      { title: "Materials", lines: ["Flashing — 2 pcs"] },
    ]);
    expect(JSON.stringify(sections)).not.toMatch(/\$|75|40/);
  });

  it("omits a whole section when its hide flag is on", () => {
    expect(reportSections(parsed, { hideLabor: true }).map((s) => s.title)).toEqual(["Materials"]);
    expect(reportSections(parsed, { hideMaterials: true }).map((s) => s.title)).toEqual(["Labor"]);
    expect(reportSections(parsed, { hideLabor: true, hideMaterials: true })).toEqual([]);
    expect(reportSections(undefined)).toEqual([]);
  });

  it("writes a stable fact-only narrative and handles empty input", () => {
    expect(draftNarrative(parsed)).toBe(draftNarrative(parsed));
    expect(draftNarrative(undefined)).toBe("");
  });

  it("pairs existing before/after photos for Problem and Corrective action columns", () => {
    const grouped = pairReportPhotos([{ label: "Damage", fullB64: "a", phase: "before" }, { label: "Repair", fullB64: "b", phase: "after" }]);
    expect(grouped.pairs[0]).toMatchObject({ before: { label: "Damage" }, after: { label: "Repair" } });
  });

  for (const hideLabor of [false, true]) for (const hideMaterials of [false, true]) {
    it(`report email never shows pricing (labor hidden=${hideLabor}, materials hidden=${hideMaterials})`, () => {
      const html = buildJobReportEmailHtml({ business: { businessName: "Business" }, logos: [], jobId: "J-1", title: "Repair", billTo: { name: "Customer" }, parsed, options: { hideLabor, hideMaterials } });
      expect(html).not.toMatch(/\$\d/);
      expect(html).not.toMatch(/total|subtotal|estimate/i);
      expect(html.includes("Ava")).toBe(!hideLabor);
      expect(html.includes("Flashing")).toBe(!hideMaterials);
    });
  }
});
