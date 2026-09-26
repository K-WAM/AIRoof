import { describe, expect, it } from "vitest";
import { reportQuoteSection } from "./reportQuote";
import { buildJobReportEmailHtml } from "@/lib/billing/jobReportEmailHtml";

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const quote = {
  quoteId: "Q-1000", status: "accepted" as const, sentAt: Date.UTC(2026, 8, 24), answeredAt: Date.UTC(2026, 8, 25),
  hideMaterials: false, hideLabor: false,
  lines: [
    { lineId: "l1", kind: "labor" as const, description: "Roof mechanic", quantity: 8, unit: "hours", unitPrice: 75 },
    { lineId: "m1", kind: "material" as const, description: "Architectural shingles", quantity: 12, unit: "bundles", unitPrice: 30 },
  ],
};
const parsed = { timeline: [], materials: [], labor: [], issues: [], invoiceSuggestions: [] };
const emailFor = (options: Record<string, boolean>, q: typeof quote | null = quote) =>
  buildJobReportEmailHtml({ business: { businessName: "Roofdoctor", timezone: "UTC" }, logos: [], jobId: "J-1", title: "Repair", billTo: { name: "Kareem" }, parsed, options, quote: q });

describe("reportQuoteSection — the report's optional quote", () => {
  it("is off unless the office ticks Include the quote", () => {
    expect(reportQuoteSection(quote, undefined, day)).toBeNull();
    expect(reportQuoteSection(quote, { includeQuote: false }, day)).toBeNull();
  });

  it("only a sent or accepted quote can appear — never a draft, declined or expired one, or none at all", () => {
    for (const status of ["draft", "declined", "expired"] as const) expect(reportQuoteSection({ ...quote, status }, { includeQuote: true }, day)).toBeNull();
    expect(reportQuoteSection(null, { includeQuote: true }, day)).toBeNull();
    expect(reportQuoteSection({ ...quote, status: "sent" }, { includeQuote: true }, day)?.heading).toBe("Quote Q-1000 · Sent 2026-09-24");
  });

  it("shows the quote id, when it was accepted, every line, and the quoted total", () => {
    const section = reportQuoteSection(quote, { includeQuote: true }, day)!;
    expect(section.heading).toBe("Quote Q-1000 · Accepted 2026-09-25");
    expect(section.total).toBe(960);
    expect(section.groups.flatMap((g) => g.rows.map((r) => r.description))).toEqual(expect.arrayContaining(["Roof mechanic", "Architectural shingles"]));
  });

  it("collapses to one 'Materials $x' row when the REPORT hides materials", () => {
    const section = reportQuoteSection(quote, { includeQuote: true, hideMaterials: true }, day)!;
    const materials = section.groups.find((g) => g.title === "Materials")!;
    expect(materials.rows).toEqual([{ description: "Materials", amount: 360 }]);
    expect(section.groups.find((g) => g.title === "Labor")!.rows[0].description).toBe("Roof mechanic");
  });

  it("collapses when the QUOTE hides them even if the report doesn't — the report can't reveal what the quote hid", () => {
    const section = reportQuoteSection({ ...quote, hideMaterials: true, hideLabor: true }, { includeQuote: true, hideMaterials: false, hideLabor: false }, day)!;
    expect(section.groups.find((g) => g.title === "Materials")!.rows).toEqual([{ description: "Materials", amount: 360 }]);
    expect(section.groups.find((g) => g.title === "Labor")!.rows).toEqual([{ description: "Labor", amount: 600 }]);
    expect(JSON.stringify(section)).not.toMatch(/Architectural shingles|Roof mechanic/);
    expect(section.total).toBe(960); // the total stays truthful
  });
});

describe("report email with and without the quote", () => {
  it("stays price-free with the box off, even when a sent quote exists", () => {
    const html = emailFor({});
    expect(html).not.toMatch(/\$\d/);
    expect(html).not.toMatch(/total|subtotal|estimate/i);
  });

  it("adds the quote, its prices and the quoted total when the box is ticked", () => {
    const html = emailFor({ includeQuote: true });
    expect(html).toContain("Quote Q-1000 · Accepted Sep 25, 2026");
    expect(html).toContain("Architectural shingles");
    expect(html).toContain("Quoted total: $960.00");
  });

  it("with Hide materials it shows one Materials row and never the item names or their unit prices", () => {
    const html = emailFor({ includeQuote: true, hideMaterials: true });
    expect(html).not.toContain("Architectural shingles");
    expect(html).not.toContain("$30.00");
    expect(html).toContain("$360.00");
    expect((html.match(/<td[^>]*>Materials<\/td>/g) ?? []).length).toBe(1); // the one collapsed row (the section title is an h3)
  });

  it("ignores a quote that was never sent", () => {
    expect(emailFor({ includeQuote: true }, { ...quote, status: "draft" as never })).not.toMatch(/\$\d/);
  });
});
