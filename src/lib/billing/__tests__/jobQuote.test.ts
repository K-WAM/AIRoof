import { describe, expect, it } from "vitest";
import { quoteLinesFromFindings, quoteTotal, nextQuoteStatus, validQuoteLines, visibleQuoteLines } from "../jobQuote";
import { buildQuoteEmailHtml } from "../jobQuoteEmailHtml";
import type { JobQuote } from "@/types/quote";

const quote: JobQuote = { quoteId: "Q-1000", businessId: "b", jobId: "j", billTo: { name: "A & B" },
  status: "draft", findings: [{ findingId: "f", category: "Roof", problem: "Leak <img>", solution: "Repair & seal",
    includeInReport: true, includeInQuote: true, addedAt: 1 }],
  lines: [{ lineId: "m", kind: "material", description: "Tile <bad>", quantity: 2, unitPrice: 10 },
    { lineId: "l", kind: "labor", description: "Repair", quantity: 1, unitPrice: 80 }],
  hideMaterials: true, validUntil: Date.now() + 86400000, subtotal: 100, total: 100, createdAt: Date.now(), updatedAt: 1, createdBy: "u" };

describe("quote", () => {
  it("builds finding lines and totals deterministically", () => {
    const lines = quoteLinesFromFindings([{ ...quote.findings[0], lines: [quote.lines[0]], includeInQuote: true },
      { ...quote.findings[0], findingId: "hidden", includeInQuote: false }]);
    expect(lines).toHaveLength(1);
    expect(lines[0].lineId).toBe("finding_f_0");
    expect(quoteTotal(quote.lines)).toBe(100);
  });
  it("only allows a sent quote to transition to a final staff status", () => {
    expect(nextQuoteStatus("draft", "accepted")).toBe(false);
    expect(nextQuoteStatus("sent", "accepted")).toBe(true);
    expect(nextQuoteStatus("sent", "declined")).toBe(true);
    expect(nextQuoteStatus("accepted", "sent")).toBe(false);
    expect(validQuoteLines([{ ...quote.lines[0], description: "<script>" }])).toBe(false);
  });
  it("hides material details and escapes all free text in the customer email", () => {
    expect(visibleQuoteLines(quote).find((l) => l.description === "Tile <bad>")).toBeUndefined();
    const html = buildQuoteEmailHtml(quote, { businessName: "Biz <x>", logoUrl: 'x" onerror="bad', brandColor: "red;background:url(x)" });
    expect(html).toContain(">Materials</td>");
    expect(html).toContain("Leak &lt;img&gt;");
    expect(html).toContain("A &amp; B");
    expect(html).not.toContain("Biz <x>");
    expect(html).not.toContain('src="x" onerror=');
    expect(html).toContain("cannot be accepted or paid online");
    expect(() => buildQuoteEmailHtml(quote, {})).toThrow("Business name required");
  });
});
