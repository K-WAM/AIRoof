import { describe, expect, it } from "vitest";
import { WORK_CATALOG_STARTER, mergeWorkStarter, workCatalogStarterFor } from "./workCatalogStarter";
import { VERTICAL_TEMPLATES, type VerticalId } from "./templates";

describe("work catalog starter", () => {
  const industries = Object.keys(VERTICAL_TEMPLATES) as VerticalId[];

  it("declares a catalog for every vertical — empty exactly when jobs is disabled", () => {
    expect(Object.keys(WORK_CATALOG_STARTER).sort()).toEqual([...industries].sort());
    for (const industry of industries) {
      const jobsDisabled = VERTICAL_TEMPLATES[industry].disabledModules.includes("jobs");
      if (jobsDisabled) {
        expect(WORK_CATALOG_STARTER[industry], industry).toEqual([]);
      } else {
        expect(WORK_CATALOG_STARTER[industry].length, industry).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it("gives roofing a substantial catalog spanning the expected work areas", () => {
    const roofing = WORK_CATALOG_STARTER.roofing;
    expect(roofing.length).toBeGreaterThanOrEqual(20);
    const categories = new Set(roofing.map((i) => i.category.toLowerCase()));
    for (const expected of [
      "leak", "flashing", "shingle", "tile", "vent", "gutter", "drain",
      "storm", "skylight", "penetration", "deck", "inspection",
    ]) {
      expect([...categories].some((c) => c.includes(expected)), `category ${expected}`).toBe(true);
    }
  });

  it("keeps every item inside the shared-contract caps and shapes", () => {
    for (const industry of industries) {
      for (const item of WORK_CATALOG_STARTER[industry]) {
        expect(item.itemId, industry).toMatch(new RegExp(`^starter-${industry}-[a-z0-9-]+$`));
        expect(item.category.length, industry).toBeGreaterThan(0);
        expect(item.category.length, industry).toBeLessThanOrEqual(60);
        expect(item.problem.length, industry).toBeGreaterThan(0);
        expect(item.problem.length, industry).toBeLessThanOrEqual(160);
        expect(item.solution.length, industry).toBeGreaterThan(0);
        expect(item.solution.length, industry).toBeLessThanOrEqual(1200);
        if (item.severity) expect(["low", "medium", "high"], industry).toContain(item.severity);
        expect(item.starter, industry).toBe(true);
        if (item.lines) {
          expect(item.lines.length, industry).toBeGreaterThanOrEqual(1);
          expect(item.lines.length, industry).toBeLessThanOrEqual(3);
          for (const l of item.lines) {
            expect(l.description.trim().length, industry).toBeGreaterThan(0);
            expect(l.quantity, industry).toBeGreaterThan(0);
            expect(l.unitPrice, industry).toBeGreaterThanOrEqual(0);
            expect(["material", "labor", "other"], industry).toContain(l.kind);
          }
        }
      }
    }
  });

  it("uses unique starter ids across the whole corpus", () => {
    const ids = new Set<string>();
    for (const industry of industries) {
      for (const item of WORK_CATALOG_STARTER[industry]) {
        expect(ids.has(item.itemId), item.itemId).toBe(false);
        ids.add(item.itemId);
      }
    }
  });

  it("never carries placeholder text or unsafe claims in customer-visible wording", () => {
    for (const industry of industries) {
      for (const item of WORK_CATALOG_STARTER[industry]) {
        const wording = [
          item.category, item.problem, item.solution,
          ...(item.lines ?? []).map((l) => l.description),
        ].join(" ");
        // Names/wording print on customer documents — no placeholder text ever.
        expect(wording, item.itemId).not.toMatch(/placeholder|edit to match|todo|tbd|lorem|xxx|\[|\]|\{|\}/i);
        // No legal/safety guarantees, warranty promises, or invented standards.
        expect(wording, item.itemId).not.toMatch(/guarantee|warrant|per code|code compliant|approved by|ul listed|asme|ansi/i);
      }
    }
  });

  it("merges idempotently — a second import adds nothing", () => {
    const starter = WORK_CATALOG_STARTER.roofing;
    const first = mergeWorkStarter({ items: [] }, starter, 100);
    expect(first.added).toBe(starter.length);
    expect(first.catalog.items).toHaveLength(starter.length);
    expect(first.catalog.updatedAt).toBe(100);
    expect(first.catalog.starterKitImported).toHaveLength(starter.length);

    const second = mergeWorkStarter(first.catalog, starter, 200);
    expect(second.added).toBe(0);
    expect(second.catalog.items).toHaveLength(starter.length);
    expect(second.catalog.updatedAt).toBe(100);
  });

  it("never re-adds a deleted starter item (starterKitImported) or overwrites tenant edits", () => {
    const starter = WORK_CATALOG_STARTER.roofing;
    const first = mergeWorkStarter({ items: [] }, starter, 100);

    const edited = { ...first.catalog.items[0], solution: "Our custom resolution wording.", starter: undefined };
    first.catalog.items[0] = edited;
    const deletedId = first.catalog.items[1].itemId;
    first.catalog.items.splice(1, 1);

    const second = mergeWorkStarter(first.catalog, starter, 200);
    expect(second.added).toBe(0);
    expect(second.catalog.items.find((i) => i.itemId === deletedId)).toBeUndefined();
    expect(second.catalog.items.find((i) => i.itemId === starter[0].itemId)?.solution).toBe("Our custom resolution wording.");
    expect(second.catalog.items.find((i) => i.itemId === starter[0].itemId)?.starter).toBeUndefined();
    expect(second.catalog.items).toHaveLength(starter.length - 1);
  });

  it("stamps new items with the import time but never touches existing ones", () => {
    const starter = WORK_CATALOG_STARTER.roofing;
    const first = mergeWorkStarter({ items: [] }, starter, 1234);
    for (const item of first.catalog.items) expect(item.createdAt).toBe(1234);

    const second = mergeWorkStarter(first.catalog, starter, 5678);
    for (const item of second.catalog.items) expect(item.createdAt).toBe(1234);
  });

  it("recognizes an existing tenant item by id and preserves it byte-for-byte", () => {
    const starter = WORK_CATALOG_STARTER.roofing;
    const existingId = starter[0].itemId;
    const tenantItem = {
      itemId: existingId, category: "Leaks", problem: "Tenant's own problem wording",
      solution: "Tenant's own resolution.", severity: "low" as const,
      createdAt: 999,
    };
    const result = mergeWorkStarter({ items: [tenantItem] }, starter, 100);
    expect(result.catalog.items.find((i) => i.itemId === existingId)).toEqual(tenantItem);
    expect(result.added).toBe(starter.length - 1);
  });

  it("returns null for an industry with no starter declaration", () => {
    expect(workCatalogStarterFor("unknown-industry")).toBeNull();
    expect(workCatalogStarterFor("")).toBeNull();
    expect(workCatalogStarterFor(undefined)).toBeNull();
    expect(workCatalogStarterFor("roofing")).not.toBeNull();
  });
});
