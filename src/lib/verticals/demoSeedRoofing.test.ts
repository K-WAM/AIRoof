import { describe, expect, it } from "vitest";
import { WORK_CATALOG_STARTER } from "./workCatalogStarter";
import { VERTICAL_TEMPLATES } from "./templates";
import { ROOFING_WORKED_JOB, type WorkedJobSeed } from "./demoSeedRoofing";

const seed: WorkedJobSeed = ROOFING_WORKED_JOB;

describe("roofing worked-job seed", () => {
  it("references only catalog items that exist in the roofing starter", () => {
    const ids = new Set(WORK_CATALOG_STARTER.roofing.map((i) => i.itemId));
    expect(seed.findingItemIds.length).toBeGreaterThanOrEqual(2);
    for (const id of seed.findingItemIds) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("uses a serviceType from the roofing approved services", () => {
    expect(VERTICAL_TEMPLATES.roofing.approvedServices).toContain(seed.serviceType);
  });

  it("carries the customer details D1 writes onto the job", () => {
    expect(seed.title.trim().length).toBeGreaterThan(0);
    expect(seed.clientName.trim().length).toBeGreaterThan(0);
    expect(seed.clientPhone).toMatch(/^\+1305555\d{4}$/);
    expect(seed.clientEmail).toMatch(/@example\.com$/);
    expect(seed.address.trim().length).toBeGreaterThan(0);
    expect(seed.notes.trim().length).toBeGreaterThan(0);
  });

  it("has three chronologically ordered updates, one of them Spanish with a translation", () => {
    expect(seed.updates).toHaveLength(3);

    const minutes = seed.updates.map((u) => u.minutesAgo);
    expect(minutes).toEqual([...minutes].sort((a, b) => b - a));

    for (const update of seed.updates) {
      expect(update.rawText.trim().length).toBeGreaterThan(0);
      expect(update.submittedBy.trim().length).toBeGreaterThan(0);
      expect(update.minutesAgo).toBeGreaterThan(0);
      expect(["en", "es"]).toContain(update.language);
    }

    const spanish = seed.updates.filter((u) => u.language === "es");
    expect(spanish).toHaveLength(1);
    expect(spanish[0].rawTextEn?.trim().length).toBeGreaterThan(0);
  });

  it("keeps every parsed payload internally consistent", () => {
    for (const update of seed.updates) {
      const { parsed } = update;
      expect(Array.isArray(parsed.timeline)).toBe(true);
      expect(Array.isArray(parsed.materials)).toBe(true);
      expect(Array.isArray(parsed.labor)).toBe(true);
      expect(Array.isArray(parsed.issues)).toBe(true);
      expect(parsed.invoiceSuggestions).toEqual([]);

      for (const event of parsed.timeline) {
        expect(event.description.trim().length).toBeGreaterThan(0);
      }
      for (const material of parsed.materials) {
        expect(material.item.trim().length).toBeGreaterThan(0);
        expect(Number(material.quantity)).toBeGreaterThan(0);
      }
      for (const labor of parsed.labor) {
        expect(labor.description.trim().length).toBeGreaterThan(0);
        expect(labor.hours).toBeGreaterThan(0);
      }
      for (const issue of parsed.issues) {
        expect(issue.description.trim().length).toBeGreaterThan(0);
        expect(["low", "medium", "high"]).toContain(issue.severity);
      }
    }
  });

  it("records the reported findings and the logged labor hours", () => {
    const issues = seed.updates.flatMap((u) => u.parsed.issues);
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.some((i) => /tile/i.test(i.description))).toBe(true);
    expect(issues.some((i) => /pipe boot/i.test(i.description))).toBe(true);

    const laborHours = seed.updates.reduce(
      (sum, u) => sum + u.parsed.labor.reduce((s, l) => s + (l.hours ?? 0), 0),
      0
    );
    expect(laborHours).toBe(3);
  });
});
