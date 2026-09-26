import { describe, expect, it } from "vitest";
import { photoPages } from "./photoPages";

const photo = (photoId: string, phase: "before" | "after" | "other", createdAt: number, extras: { pairId?: string; sort?: number } = {}) => ({ photoId, label: photoId, phase, createdAt, thumbB64: "x", ...extras });

describe("photoPages", () => {
  it("uses explicit After-to-Before pairs before legacy positional pairing", () => {
    const [page] = photoPages([
      photo("before-1", "before", 1), photo("before-2", "before", 2),
      photo("after-1", "after", 3), photo("after-2", "after", 4, { pairId: "before-1" }),
    ]);
    expect(page.rows).toEqual([
      expect.objectContaining({ before: expect.objectContaining({ photoId: "before-1" }), after: expect.objectContaining({ photoId: "after-2" }) }),
      expect.objectContaining({ before: expect.objectContaining({ photoId: "before-2" }), after: expect.objectContaining({ photoId: "after-1" }) }),
    ]);
  });

  it("keeps legacy no-pairId Before and After photos paired by stable position", () => {
    const [page] = photoPages([photo("after-later", "after", 40), photo("before-first", "before", 10), photo("after-first", "after", 20), photo("before-later", "before", 30)]);
    expect(page.rows.map((row) => [row.before?.photoId, row.after?.photoId])).toEqual([
      ["before-first", "after-first"], ["before-later", "after-later"],
    ]);
  });

  it("puts unpaired photos after pairs, two per row, and honors sparse sort before createdAt", () => {
    const [page] = photoPages([
      photo("other-second", "other", 1, { sort: 2000 }), photo("other-first", "other", 99, { sort: 1000 }),
      photo("before-only", "before", 2), photo("after-orphan", "after", 3, { pairId: "gone" }),
    ]);
    expect(page.rows.map((row) => [row.before?.photoId, row.after?.photoId])).toEqual([
      ["before-only", "after-orphan"], ["other-first", "other-second"],
    ]);
  });

  it("splits pairs into pages of four rows by default and accepts a page-size override", () => {
    const photos = Array.from({ length: 5 }, (_, index) => photo(`other-${index}`, "other", index));
    expect(photoPages(photos).map((page) => page.rows)).toHaveLength(1);
    expect(photoPages(photos, { pairsPerPage: 1 }).map((page) => page.rows)).toHaveLength(3);
  });
});
