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
    expect(projection.transcriptEn).toBeUndefined();
    expect(projection.sourceLanguage).toBeUndefined();
  });

  it("does not concatenate transcriptEn across multiple Spanish updates", () => {
    const projection = buildProjection([
      update({ updateId: "upd_1", createdAt: 1000, parsed: { timeline: [], materials: [], labor: [], issues: [], invoiceSuggestions: [], transcriptEn: "First translation" } }),
      update({ updateId: "upd_2", createdAt: 2000, parsed: { timeline: [], materials: [], labor: [], issues: [], invoiceSuggestions: [], transcriptEn: "Second translation" } }),
    ]);
    expect(projection.transcriptEn).toBeUndefined();
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

describe("buildProjection — one labor line per worker per day", () => {
  const T = Date.UTC(2026, 8, 25, 15, 0); // same local day for every note below
  const note = (id: string, at: number, labor: Array<Record<string, unknown>>) =>
    update({ updateId: id, createdAt: at, parsed: { timeline: [], materials: [], labor: labor as never, issues: [], invoiceSuggestions: [] } });

  // The owner's real J-1001: "Marco arrived at 8" + "Marco left at 11, three hours" + a later "Marco just arrived" note
  // used to give THREE Marco rows on the invoice, two of them with no hours; Kevin's row had an invented 08:00.
  it("merges a worker's notes from the same day into one line with the summed hours and the widest time span", () => {
    const projection = buildProjection([
      note("u1", T, [{ description: "Marco", arrivalTime: "08:00" }]),
      note("u2", T + 3_600_000, [{ description: "Marco", hours: 3, arrivalTime: "8:00 AM", departureTime: "11:00 AM" }]),
      note("u3", T + 7_200_000, [{ description: "Kevin" }]),
    ]);
    expect(projection.labor.map((l) => l.description)).toEqual(["Marco", "Kevin"]);
    const marco = projection.labor[0];
    expect(marco.hours).toBe(3);
    expect(marco.arrivalTime).toBe("8:00 AM");
    expect(marco.departureTime).toBe("11:00 AM");
    expect(projection.labor[1].hours).toBeUndefined();
  });

  it("sums hours across two notes, and takes the earliest arrival and latest departure", () => {
    const projection = buildProjection([
      note("u1", T, [{ description: "Ana", hours: 4, arrivalTime: "09:00", departureTime: "1 PM" }]),
      note("u2", T + 1000, [{ description: "ana", hours: 3, arrivalTime: "2 PM", departureTime: "17:00" }]),
    ]);
    expect(projection.labor).toHaveLength(1);
    expect(projection.labor[0]).toMatchObject({ hours: 7, arrivalTime: "9:00 AM", departureTime: "5:00 PM" });
  });

  it("matches names regardless of case and accents, but keeps different workers and different days apart", () => {
    const projection = buildProjection([
      note("u1", T, [{ description: "José", hours: 2 }]),
      note("u2", T + 1000, [{ description: "jose", hours: 2 }, { description: "Luis", hours: 1 }]),
      note("u3", T + 3 * 86_400_000, [{ description: "José", hours: 5 }]), // a different day stays its own shift
    ]);
    const byName = projection.labor.map((l) => `${l.description}:${l.hours}`);
    expect(byName).toEqual(["José:4", "Luis:1", "José:5"]);
  });

  it("leaves unrecognisable time text exactly as typed instead of guessing", () => {
    const projection = buildProjection([note("u1", T, [{ description: "Sam", arrivalTime: "first thing", hours: 2 }])]);
    expect(projection.labor[0].arrivalTime).toBe("first thing");
  });

  it("never merges a hours-corrected line away: corrections are applied before merging", () => {
    const projection = buildProjection([
      note("u1", T, [{ description: "Marco", hours: 8 }]),
      update({ updateId: "c1", kind: "correction", createdAt: T + 1000, rawText: "fix", targetUpdateId: "u1", correctionField: "labor", correctionItem: "marco", correctionNewValue: 6, parsed: undefined }),
      note("u2", T + 2000, [{ description: "Marco", hours: 1 }]),
    ]);
    expect(projection.labor).toHaveLength(1);
    expect(projection.labor[0].hours).toBe(7); // 6 (corrected) + 1
  });
});
