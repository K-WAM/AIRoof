import { describe, expect, it } from "vitest";
import { suggestFindings } from "./suggestFindings";
import type { Job } from "@/types/jobs";
import type { WorkCatalogItem } from "@/types/workCatalog";

const item = (itemId: string, category: string, problem: string, solution: string): WorkCatalogItem =>
  ({ itemId, category, problem, solution, createdAt: 1 });

const CATALOG: WorkCatalogItem[] = [
  item("tile-cracked", "Shingles / Tile", "Concrete or clay tiles are cracked, chipped, or broken.", "Replace the damaged tiles with matching pieces and re-bed them."),
  item("pipe-boot", "Flashing", "The rubber collar around a plumbing vent pipe is cracked and lifting.", "Remove the old collar and install a new pipe boot with sealant."),
  item("gutter-clogged", "Gutters / Drainage", "Gutters are full of debris and overflow during rain.", "Remove the debris from the gutters and flush the runs."),
  item("vent-ridge", "Ventilation", "The ridge vent is blocked by debris.", "Clear the vent openings."),
];

const job = (issues: Array<{ description: string; resolution?: string }>, findings: Job["findings"] = []): Job => ({
  jobId: "J-1", businessId: "b", title: "t", status: "open", createdAt: 1, updatedAt: 1, findings,
  parsed: { timeline: [], materials: [], labor: [], invoiceSuggestions: [],
    issues: issues.map((i) => ({ severity: "medium" as const, ...i })) },
});

describe("suggestFindings", () => {
  it("ranks the catalog item that matches the reported issue first", () => {
    const out = suggestFindings(job([{ description: "Six cracked tiles on the south slope." }]), CATALOG);
    expect(out[0].itemId).toBe("tile-cracked");
  });

  it("matches plurals and singulars (boots / boot)", () => {
    const out = suggestFindings(job([{ description: "Split pipe boot at the vent penetration." }]), CATALOG);
    expect(out.map((i) => i.itemId)).toContain("pipe-boot");
  });

  it("does not suggest anything for a single shared filler word", () => {
    const out = suggestFindings(job([{ description: "Checked the roof, general wear throughout." }]), CATALOG);
    expect(out).toEqual([]);
  });

  it("returns nothing when there are no issues or no match", () => {
    expect(suggestFindings(job([]), CATALOG)).toEqual([]);
    expect(suggestFindings(job([{ description: "Customer wants a quote for solar panels." }]), CATALOG)).toEqual([]);
  });

  it("folds case and diacritics", () => {
    const out = suggestFindings(job([{ description: "TEJAS QUEBRADAS — cracked TILES" }]), CATALOG);
    expect(out[0].itemId).toBe("tile-cracked");
  });

  it("excludes items already on the job and caps at 5", () => {
    const onJob = job([{ description: "cracked tiles and a cracked pipe boot" }], [
      { findingId: "f1", itemId: "tile-cracked", category: "x", problem: "x", solution: "x", includeInReport: true, includeInQuote: true, addedAt: 1 },
    ]);
    expect(suggestFindings(onJob, CATALOG).map((i) => i.itemId)).not.toContain("tile-cracked");
    const many = Array.from({ length: 9 }, (_, n) => item(`t${n}`, "Tile", `Cracked tile variant ${n}`, "Replace the tile."));
    expect(suggestFindings(job([{ description: "cracked tile" }]), many)).toHaveLength(5);
  });
});
