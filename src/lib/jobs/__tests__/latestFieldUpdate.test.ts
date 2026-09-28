import { describe, expect, it } from "vitest";
import { latestFieldUpdate } from "../writeProjection";
import type { FieldUpdate } from "@/types/jobs";

const update = (createdAt: number, rawText: string, extra: Partial<FieldUpdate> = {}) =>
  ({ updateId: `u${createdAt}`, jobId: "J-1", createdAt, rawText, ...extra }) as FieldUpdate;

describe("latestFieldUpdate", () => {
  it("returns the newest note, in English, with who sent it", () => {
    expect(latestFieldUpdate([
      update(1000, "Arrived on site.", { submittedBy: "Marco" }),
      update(3000, "Seis tejas rotas.", { submittedBy: "Luis", rawTextEn: "Six cracked tiles." }),
      update(2000, "Pipe boot split."),
    ])).toEqual({ at: 3000, by: "Luis", text: "Six cracked tiles." });
  });

  it("keeps it to one short line and ignores an empty ledger", () => {
    expect(latestFieldUpdate([])).toBeNull();
    const long = latestFieldUpdate([update(1, `line one\n\n${"x".repeat(300)}`)]);
    expect(long?.text.startsWith("line one x")).toBe(true);
    expect(long?.text.length).toBe(158);
    expect(long?.by).toBeUndefined();
  });
});
