import { describe, expect, it } from "vitest";
import { isValidCorrection, storedJobContext, workerName } from "./fieldInput";

describe("field-note input checks", () => {
  it("refuses corrections that would poison the projection", () => {
    for (const bad of [null, "x", {}, { targetUpdateId: "u1", item: "shingles", newValue: "abc" }, { targetUpdateId: "u1", item: "shingles", newValue: -1 },
      { targetUpdateId: "u1", item: { $gt: 1 }, newValue: 2 }, { targetUpdateId: 5, item: "shingles", newValue: 2 }, { targetUpdateId: "u1", item: "shingles", newValue: "" }]) {
      expect(isValidCorrection(bad)).toBe(false);
    }
    expect(isValidCorrection({ targetUpdateId: "u1", item: "shingles", newValue: "12" })).toBe(true);
  });
  it("caps the worker name and falls back on blanks", () => {
    expect(workerName("  Carlos ")).toBe("Carlos");
    expect(workerName({})).toBe("Crew (no name given)");
    expect(workerName("x".repeat(500))).toHaveLength(80);
  });
  it("builds the model's job context only from the stored job's text fields", () => {
    expect(storedJobContext({ title: "Reroof", address: 4, clientName: "Ana" })).toEqual({ title: "Reroof", address: undefined, serviceType: undefined, clientName: "Ana" });
    expect(storedJobContext(undefined).title).toBeUndefined();
  });
});
