import { describe, it, expect } from "vitest";
import { buildProjection } from "../projection";
import type { FieldUpdate } from "@/types/jobs";

function update(overrides: Partial<FieldUpdate> = {}): FieldUpdate {
  return {
    updateId: "upd_1",
    kind: "normal",
    rawText: "puse doce bundles",
    createdAt: Date.now(),
    parsed: { timeline: [], materials: [], labor: [], issues: [], invoiceSuggestions: [] },
    ...overrides,
  };
}

describe("buildProjection — Spanish fields must never fold across updates (Phase 12, Phase 6)", () => {
  it("never carries transcriptEn/sourceLanguage from a per-update parse onto the job-level projection", () => {
    const projection = buildProjection([
      update({
        updateId: "upd_1",
        parsed: {
          timeline: [], materials: [{ item: "shingles", quantity: "12" }], labor: [], issues: [],
          invoiceSuggestions: [],
          transcriptEn: "I put twelve bundles",
          sourceLanguage: "es",
        },
      }),
    ]);
    expect((projection as Record<string, unknown>).transcriptEn).toBeUndefined();
    expect((projection as Record<string, unknown>).sourceLanguage).toBeUndefined();
  });

  it("does not concatenate transcriptEn across multiple Spanish updates", () => {
    const projection = buildProjection([
      update({ updateId: "upd_1", createdAt: 1000, parsed: { timeline: [], materials: [], labor: [], issues: [], invoiceSuggestions: [], transcriptEn: "First translation" } }),
      update({ updateId: "upd_2", createdAt: 2000, parsed: { timeline: [], materials: [], labor: [], issues: [], invoiceSuggestions: [], transcriptEn: "Second translation" } }),
    ]);
    expect((projection as Record<string, unknown>).transcriptEn).toBeUndefined();
  });

  it("still folds materials/labor/issues normally alongside the Spanish fields", () => {
    const projection = buildProjection([
      update({
        parsed: {
          timeline: [{ description: "arrived on site" }],
          materials: [{ item: "shingles", quantity: "12" }],
          labor: [{ description: "José", hours: 4 }],
          issues: [{ description: "leak found", severity: "high" }],
          invoiceSuggestions: [],
          transcriptEn: "I put twelve bundles of shingles",
          sourceLanguage: "es",
        },
      }),
    ]);
    expect(projection.materials).toEqual([{ item: "shingles", quantity: "12", unit: undefined }]);
    expect(projection.labor[0].description).toBe("José"); // worker names are never translated
    expect(projection.issues[0].description).toBe("leak found");
  });
});
