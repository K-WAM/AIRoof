import { describe, expect, it } from "vitest";
import { draftWorkDescription, workBullet, workBullets } from "./workSummary";
import { validNarrative } from "./validation";
import { WORK_CATALOG_STARTER } from "@/lib/verticals/workCatalogStarter";

const f = (problem: string, solution: string, lines?: Array<{ description: string; kind: "labor" | "material" | "other" }>) => ({
  problem, solution, lines: lines?.map((l) => ({ ...l, quantity: 1, unitPrice: 10 })),
});

describe("workBullet", () => {
  it("names the work by the finding's own labor line", () => {
    expect(workBullet(f("Concrete or clay tiles are cracked", "Replace the damaged tiles with matching pieces.", [
      { description: "Matching roof tile", kind: "material" }, { description: "Tile replacement", kind: "labor" },
    ]))).toBe("Tile replacement");
  });

  it("falls back to the first priced line, then to a short clip of the work text", () => {
    expect(workBullet(f("p", "s", [{ description: "Emergency tarp", kind: "material" }]))).toBe("Emergency tarp");
    expect(workBullet(f("Rusted drip edge", "Replace the drip edge along the fascia. Then paint it."))).toBe("Replace the drip edge along the fascia");
  });

  it("never returns a long catalog sentence — it is clipped at a natural break", () => {
    const long = f("p", "Remove the old collar, clean the pipe and the surrounding roof surface, and install a new flashing assembly with sealant.");
    const bullet = workBullet(long);
    expect(bullet.length).toBeLessThanOrEqual(80);
    expect(bullet.endsWith(",")).toBe(false);
    expect(bullet.startsWith("Remove the old collar")).toBe(true);
  });

  it("capitalises and strips trailing punctuation", () => {
    expect(workBullet(f("p", "s", [{ description: "re-flash wall intersection.", kind: "labor" }]))).toBe("Re-flash wall intersection");
  });
});

describe("draftWorkDescription", () => {
  it("is one blunt bullet per line, de-duplicated, and empty when there is nothing", () => {
    const findings = [
      f("a", "s", [{ description: "Tile replacement", kind: "labor" }]),
      f("b", "s", [{ description: "Pipe collar replacement", kind: "labor" }]),
      f("c", "s", [{ description: "tile replacement", kind: "labor" }]),
    ];
    expect(draftWorkDescription(findings)).toBe("• Tile replacement\n• Pipe collar replacement");
    expect(draftWorkDescription([])).toBe("");
    expect(draftWorkDescription(undefined)).toBe("");
  });

  it("every roofing starter item yields a short, non-empty bullet that is safe to store", () => {
    for (const item of WORK_CATALOG_STARTER.roofing) {
      const bullet = workBullet(item);
      expect(bullet.length, item.itemId).toBeGreaterThan(2);
      expect(bullet.length, item.itemId).toBeLessThanOrEqual(80);
      expect(validNarrative(`• ${bullet}`), item.itemId).toBe(true);
    }
  });

  it("the owner's demo job reads as two plain lines", () => {
    const byId = new Map(WORK_CATALOG_STARTER.roofing.map((item) => [item.itemId, item]));
    const jobFindings = ["starter-roofing-tile-cracked", "starter-roofing-flashing-pipe-collar"].map((id) => byId.get(id)!);
    expect(workBullets(jobFindings)).toEqual(["Tile replacement", "Pipe collar replacement"]);
  });
});
