import { describe, expect, it } from "vitest";

import { adversarialFixtures } from "@/lib/schemas/__tests__/fixtures/adversarial";
import { parseFieldUpdateOutput } from "@/lib/schemas";
import {
  fieldNoteAccuracyFixtures,
  scoreFieldNoteOutput,
} from "@/lib/ai/__tests__/fixtures/field-note-transcripts";

describe("parse-field-update model comparison fixtures", () => {
  it("scores captured field-note outputs fact by fact", () => {
    const fixture = fieldNoteAccuracyFixtures[2];
    const result = scoreFieldNoteOutput(fixture, {
      timeline: [],
      materials: [{ item: "architectural shingles", quantity: "25", unit: "squares", cost: 2125 }],
      labor: [{ description: "Alex", hours: 7.5 }],
      issues: [],
      invoiceSuggestions: [],
    });

    expect(result).toEqual({ passed: 3, total: 3, missed: [] });
  });

  it("counts a missing or incorrect extraction as an accuracy regression", () => {
    const fixture = fieldNoteAccuracyFixtures[2];
    const result = scoreFieldNoteOutput(fixture, {
      timeline: [],
      materials: [{ item: "architectural shingles", quantity: "25", unit: "squares" }],
      labor: [{ description: "Alex", hours: 8 }],
      issues: [],
      invoiceSuggestions: [],
    });

    expect(result.passed).toBe(1);
    expect(result.total).toBe(3);
    expect(result.missed).toHaveLength(2);
  });

  it("keeps the adversarial field-output rejection corpus in the comparison gate", () => {
    const fieldOutputAttacks = adversarialFixtures.filter(
      (fixture) => fixture.parser === "fieldUpdate",
    );

    expect(fieldOutputAttacks.length).toBeGreaterThanOrEqual(4);
    for (const fixture of fieldOutputAttacks) {
      expect(parseFieldUpdateOutput(fixture.input).ok, fixture.name).toBe(false);
    }
  });
});
