import { describe, expect, it } from "vitest";
import { addFindingToQuote, customFinding, findingFromCatalogItem, groupQuoteItems, linesForFinding, removeFindingFromQuote } from "./quoteItems";
import { quoteTotal, validQuoteLines } from "./jobQuote";
import { validFindings } from "@/lib/jobs/findings";
import type { WorkCatalogItem } from "@/types/workCatalog";

const TILE: WorkCatalogItem = {
  itemId: "starter-roofing-tile-cracked", category: "Shingles / Tile", problem: "Cracked tiles", solution: "Replace the tiles.", createdAt: 1,
  lines: [
    { description: "Matching roof tile", quantity: 6, unit: "each", unitPrice: 9, kind: "material" },
    { description: "Tile replacement", quantity: 4, unit: "hr", unitPrice: 95, kind: "labor" },
  ],
};
const empty = { findings: [], lines: [] };

describe("quote items", () => {
  it("adding a Library item adds the finding AND its lines at the Library prices; the total is exactly the sum of the lines", () => {
    const next = addFindingToQuote(empty, findingFromCatalogItem(TILE));
    expect(next.added).toBe(true);
    expect(next.findings).toHaveLength(1);
    expect(next.lines).toHaveLength(2);
    expect(next.lines.every((line) => line.findingId === next.findings[0].findingId)).toBe(true);
    expect(quoteTotal(next.lines)).toBe(6 * 9 + 4 * 95); // 434
    expect(validQuoteLines(next.lines)).toBe(true);
    expect(validFindings(next.findings)).toBe(true);
  });

  it("does not add the same Library item twice", () => {
    const once = addFindingToQuote(empty, findingFromCatalogItem(TILE));
    const twice = addFindingToQuote(once, findingFromCatalogItem(TILE));
    expect(twice.added).toBe(false);
    expect(twice.lines).toHaveLength(2);
    expect(twice.findings).toHaveLength(1);
  });

  it("forces includeInQuote on for an added finding", () => {
    const off = { ...findingFromCatalogItem(TILE), includeInQuote: false };
    expect(addFindingToQuote(empty, off).findings[0].includeInQuote).toBe(true);
  });

  it("removing an item removes its finding and every line that belongs to it, and only those", () => {
    const withTile = addFindingToQuote(empty, findingFromCatalogItem(TILE));
    const custom = customFinding({ problem: "Rusted drip edge", solution: "Replace it.", price: 120 });
    const both = addFindingToQuote(withTile, custom);
    expect(quoteTotal(both.lines)).toBe(434 + 120);
    const after = removeFindingFromQuote(both, withTile.findings[0].findingId);
    expect(after.findings.map((f) => f.problem)).toEqual(["Rusted drip edge"]);
    expect(quoteTotal(after.lines)).toBe(120);
  });

  it("a custom item with a price becomes one 'other' line; without a price it has no lines", () => {
    const priced = customFinding({ problem: "  Rusted drip edge ", solution: " Replace it. ", price: 99.999 });
    expect(priced.problem).toBe("Rusted drip edge");
    expect(priced.lines).toEqual([{ description: "Rusted drip edge", quantity: 1, unitPrice: 100, kind: "other" }]);
    expect(customFinding({ problem: "Note only", solution: "", price: 0 }).lines).toBeUndefined();
    expect(customFinding({ problem: "Note only", solution: "", price: NaN }).lines).toBeUndefined();
    expect(customFinding({ problem: "Note only", solution: "", price: -5 }).lines).toBeUndefined();
  });

  it("carries a saved-to-Library itemId onto a custom item so it dedupes", () => {
    const saved = customFinding({ problem: "Rusted drip edge", solution: "x", itemId: "custom-abc" });
    const q = addFindingToQuote(empty, saved);
    expect(addFindingToQuote(q, { ...saved, findingId: "other" }).added).toBe(false);
  });

  it("groups lines under their finding and puts unmatched lines under 'Other work'", () => {
    const withTile = addFindingToQuote(empty, findingFromCatalogItem(TILE));
    const stray = { lineId: "manual-1", description: "Dumpster", quantity: 1, unitPrice: 300, kind: "other" as const };
    const orphan = { lineId: "old-1", findingId: "deleted-finding", description: "Orphan", quantity: 1, unitPrice: 10, kind: "other" as const };
    const groups = groupQuoteItems({ findings: withTile.findings, lines: [...withTile.lines, stray, orphan] });
    expect(groups).toHaveLength(2);
    expect(groups[0].finding?.problem).toBe("Cracked tiles");
    expect(groups[0].lines).toHaveLength(2);
    expect(groups[1].finding).toBeNull();
    expect(groups[1].lines.map((l) => l.lineId)).toEqual(["manual-1", "old-1"]);
    // every line appears in exactly one group
    expect(groups.flatMap((g) => g.lines)).toHaveLength(4);
  });

  it("gives deterministic line ids so a re-add never duplicates rows", () => {
    const finding = findingFromCatalogItem(TILE);
    expect(linesForFinding(finding).map((l) => l.lineId)).toEqual([`finding_${finding.findingId}_0`, `finding_${finding.findingId}_1`]);
  });
});
