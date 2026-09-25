import { describe, expect, it } from "vitest";
import { draftNarrative, draftReportNotes, pairReportPhotos, reportSections } from "./report";
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

describe("draftReportNotes", () => {
  const visit = {
    serviceType: "Roof inspection", address: "1420 Palm Way",
    parsed: {
      timeline: [{ description: "Marco arrived on site." }, { description: "Walked the south slope and checked the vent." }, { description: "Marco left the site." }],
      materials: [{ item: "Roof tile", quantity: "6", unit: "each", cost: 54 }],
      labor: [{ description: "Marco", hours: 3, rate: 95, arrivalTime: "8:00 AM", departureTime: "11:00 AM" }],
      issues: [{ description: "Six cracked tiles.", severity: "medium" as const }],
      invoiceSuggestions: [],
    },
  };

  it("drafts service, site visit, issues, work notes and materials from what was recorded", () => {
    const text = draftReportNotes(visit);
    expect(text).toContain("Service: Roof inspection at 1420 Palm Way.");
    expect(text).toContain("Site visit: Marco on site 8:00 AM–11:00 AM (3 h).");
    expect(text).toContain("Issues identified: Six cracked tiles..".replace("..", "."));
    expect(text).toContain("Work notes: Walked the south slope and checked the vent.");
    expect(text).toContain("Materials used: Roof tile (6 each).");
  });

  it("never contains a price, rate or dollar sign", () => {
    const text = draftReportNotes(visit);
    expect(text).not.toMatch(/\$|\b95\b|\b54\b/);
  });

  it("drops arrival/departure timeline lines (they repeat the site-visit sentence)", () => {
    const text = draftReportNotes(visit);
    expect(text).not.toContain("arrived on site");
    expect(text).not.toContain("left the site");
  });

  it("with Hide labor details on, names nobody and gives no hours", () => {
    const text = draftReportNotes(visit, { hideLabor: true });
    expect(text).not.toContain("Marco");
    expect(text).not.toContain("Site visit");
    expect(text).not.toContain("3 h");
  });

  it("with Hide materials on, lists no materials", () => {
    expect(draftReportNotes(visit, { hideMaterials: true })).not.toContain("Materials used");
  });

  it("is deterministic and empty when nothing is recorded", () => {
    expect(draftReportNotes(visit)).toBe(draftReportNotes(visit));
    expect(draftReportNotes({})).toBe("");
    expect(draftReportNotes({ serviceType: "Roof inspection", parsed: { timeline: [], materials: [], labor: [], issues: [], invoiceSuggestions: [] } })).toBe("Service: Roof inspection.");
  });
});
