import { describe, expect, it } from "vitest";
import { draftNarrative, pairReportPhotos, reportGroups, reportTotal } from "./report";
import { buildJobReportEmailHtml } from "@/lib/billing/jobReportEmailHtml";

const parsed = {
  timeline: [{ description: "Removed damaged flashing" }],
  materials: [{ item: "Flashing", quantity: "2", unit: "pcs", cost: 40 }],
  labor: [{ description: "Ava", hours: 2, rate: 75 }],
  issues: [{ description: "Damaged flashing", severity: "high" as const }],
  invoiceSuggestions: [],
};

describe("report document helpers", () => {
  it("collapses hidden labor and materials without changing the total", () => {
    const visible = reportGroups(parsed, 65);
    const hidden = reportGroups(parsed, 65, { hideLabor: true, hideMaterials: true });
    expect(hidden.flatMap((group) => group.rows).map((row) => row.description)).toEqual(["Labor", "Materials"]);
    expect(hidden.flatMap((group) => group.rows).map((row) => row.detail)).toEqual([undefined, undefined]);
    expect(reportTotal(hidden)).toBe(reportTotal(visible));
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
    it(`keeps true totals while applying report email hide flags labor=${hideLabor} materials=${hideMaterials}`, () => {
      const html = buildJobReportEmailHtml({ business: { businessName: "Business" }, logos: [], jobId: "J-1", title: "Repair", billTo: { name: "Customer" }, parsed, defaultRate: 65, options: { hideLabor, hideMaterials } });
      expect(html).toContain("$190.00");
      expect(html.includes("Ava")).toBe(!hideLabor);
      expect(html.includes("Flashing")).toBe(!hideMaterials);
      if (hideLabor) { expect(html).not.toContain("2 hours"); expect(html).not.toContain("$75.00"); }
      if (hideMaterials) expect(html).not.toContain("2 pcs × $40.00");
    });
  }
});
