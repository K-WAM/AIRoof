import { beforeEach, describe, expect, it } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { putPhoto } from "./store";

type Db = Parameters<typeof putPhoto>[0];
let db = makeFakeDb();
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const put = (input: Partial<Parameters<typeof putPhoto>[3]>) =>
  putPhoto(db as unknown as Db, "biz", "J-1", { label: "Ridge", thumbB64: PNG, fullB64: PNG, ...input } as Parameters<typeof putPhoto>[3]);

beforeEach(() => { db = makeFakeDb(); db.__seed("businesses/biz/jobs", "J-1", { jobId: "J-1" }); });

describe("putPhoto", () => {
  it("refuses anything that is not plain base64 (it is interpolated into the report email's HTML)", async () => {
    expect(await put({ thumbB64: `${PNG}" onerror="alert(1)` })).toHaveProperty("error");
    expect(await put({ fullB64: "<b>hi</b>" })).toHaveProperty("error");
    expect(await put({ fullB64: 42 as unknown as string })).toHaveProperty("error");
    expect(await put({ thumbB64: "A".repeat(150_004) })).toHaveProperty("error");
    expect(await put({ label: { x: 1 } as unknown as string })).toHaveProperty("error");
    expect(db.__list("businesses/biz/jobs/J-1/photos")).toHaveLength(0);
  });
  it("saves two photos taken in the same millisecond as two photos, with capped text and sane sizes", async () => {
    const [a, b] = await Promise.all([put({ label: "x".repeat(500), w: Number.NaN, h: 240 }), put({})]);
    expect("photoId" in a && "photoId" in b && a.photoId !== b.photoId).toBe(true);
    const photos = db.__list("businesses/biz/jobs/J-1/photos").map((doc) => doc.data as { label: string; w?: number; h?: number });
    expect(photos).toHaveLength(2);
    const long = photos.find((p) => p.label.startsWith("x"))!;
    expect(long.label).toHaveLength(200);
    expect(long.w).toBeUndefined();
    expect(long.h).toBe(240);
  });
});
