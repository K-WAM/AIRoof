import { describe, expect, it } from "vitest";
import { isValidCorrection, ledgerId, resolveAuthor, storedJobContext, summarizeParsed, workerName } from "./fieldInput";

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

  it("names the author from the login, and needs a typed name on a field-QR link", () => {
    expect(resolveAuthor({ uid: "u1", displayName: "Carlos", email: "c@x.test" }, "Someone else")).toEqual({ name: "Carlos", uid: "u1", via: "login" });
    expect(resolveAuthor({ uid: "u2", email: "c@x.test" }, undefined)).toMatchObject({ name: "c@x.test" });
    expect(resolveAuthor({ uid: "field:biz:t" }, "  ")).toHaveProperty("error");
    expect(resolveAuthor({ uid: "field:biz:t" }, "Ana")).toEqual({ name: "Ana", via: "qr" });
  });
  it("receipts say what a note added in plain words", () => {
    expect(summarizeParsed({ materials: [{}], labor: [{ hours: 8 }, { hours: 0.5 }], issues: [{}, {}] })).toBe("Added 1 material, 8.5 h labor, 2 issues");
    expect(summarizeParsed({ timeline: [{}] })).toBe("Added 1 work step");
    expect(summarizeParsed({})).toBe("Saved as a note");
  });
  it("ledger ids never collide in the same millisecond", () => {
    expect(new Set(Array.from({ length: 50 }, () => ledgerId("upd", 1))).size).toBe(50);
  });
});
