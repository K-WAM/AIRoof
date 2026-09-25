import { describe, expect, it, vi } from "vitest";
import { pollJobOnce } from "./livePoll";

const job = (updatedAt: number) => ({ jobId: "J-1", updatedAt, parsed: { timeline: [{ description: "Marco arrived" }] } });
const respond = (data: unknown, ok = true) => Promise.resolve({ ok, json: async () => data } as Response);

function fakeFetch(routes: Record<string, () => Promise<Response>>) {
  return vi.fn(async (url: string) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error(`unexpected fetch ${url}`);
    return routes[key]();
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("pollJobOnce", () => {
  it("reads only the job document when nothing changed (the cheap common case)", async () => {
    const f = fakeFetch({ "/api/jobs/J-1?": () => respond({ job: job(100) }) });
    expect(await pollJobOnce({ businessId: "biz", jobId: "J-1", lastSeenUpdatedAt: 100, includePhotos: true, fetchImpl: f })).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("when the job changed, returns it with the field updates so the page shows a new note without a reload", async () => {
    const f = fakeFetch({
      "/updates?": () => respond({ updates: [{ updateId: "u1", rawText: "used 12 bundles" }] }),
      "/api/jobs/J-1?": () => respond({ job: job(200) }),
    });
    const result = await pollJobOnce({ businessId: "biz", jobId: "J-1", lastSeenUpdatedAt: 100, includePhotos: false, fetchImpl: f });
    expect(result?.job.updatedAt).toBe(200);
    expect(result?.updates).toEqual([{ updateId: "u1", rawText: "used 12 bundles" }]);
    expect(result?.photos).toBeNull();
    expect(f).toHaveBeenCalledTimes(2); // job + updates, no photos fetch
  });

  it("also refreshes photos once the Photos tab has been opened", async () => {
    const f = fakeFetch({
      "/photos?": () => respond({ photos: [{ photoId: "p1" }] }),
      "/updates?": () => respond({ updates: [] }),
      "/api/jobs/J-1?": () => respond({ job: job(300) }),
    });
    const result = await pollJobOnce({ businessId: "biz", jobId: "J-1", lastSeenUpdatedAt: 200, includePhotos: true, fetchImpl: f });
    expect(result?.photos).toEqual([{ photoId: "p1" }]);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("a failed poll keeps what is on screen: it returns null and never throws", async () => {
    const notOk = fakeFetch({ "/api/jobs/J-1?": () => respond({}, false) });
    expect(await pollJobOnce({ businessId: "biz", jobId: "J-1", lastSeenUpdatedAt: 1, includePhotos: false, fetchImpl: notOk })).toBeNull();
    const boom = vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect(await pollJobOnce({ businessId: "biz", jobId: "J-1", lastSeenUpdatedAt: 1, includePhotos: false, fetchImpl: boom })).toBeNull();
  });

  it("a failing updates fetch still returns the fresh job (updates stay as they were)", async () => {
    const f = fakeFetch({
      "/updates?": () => respond({}, false),
      "/api/jobs/J-1?": () => respond({ job: job(400) }),
    });
    const result = await pollJobOnce({ businessId: "biz", jobId: "J-1", lastSeenUpdatedAt: 1, includePhotos: false, fetchImpl: f });
    expect(result?.job.updatedAt).toBe(400);
    expect(result?.updates).toBeNull();
  });
});
