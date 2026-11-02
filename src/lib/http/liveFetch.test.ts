import { afterEach, describe, expect, it, vi } from "vitest";
import { createLiveFetch } from "./liveFetch";

afterEach(() => vi.useRealTimers());
describe("component-owned conditional list fetch", () => {
  it("reuses payloads only for the same tenant and filters; sends the last server version", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ jobs: [{ jobId: "j" }], pollVersion: "v1" }))
      .mockResolvedValueOnce(Response.json({ unchanged: true, pollVersion: "v1" }))
      .mockResolvedValueOnce(Response.json({ jobs: [], pollVersion: "v2" }));
    const load = createLiveFetch(fetcher);
    expect(await (await load("/api/jobs?businessId=a")).json()).toHaveProperty("jobs.0.jobId", "j");
    expect(await (await load("/api/jobs?businessId=a")).json()).toHaveProperty("jobs.0.jobId", "j");
    expect(fetcher.mock.calls[1][0]).toContain("pollVersion=v1");
    await load("/api/jobs?businessId=b");
    expect(fetcher.mock.calls[2][0]).toBe("/api/jobs?businessId=b&pollVersion=");
  });
  it("keeps the cached version after failures and forces a full resync after five minutes", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ jobs: [], pollVersion: "v1" }))
      .mockResolvedValueOnce(Response.json({ error: "offline" }, { status: 503 }))
      .mockResolvedValue(Response.json({ unchanged: true, pollVersion: "v1" }));
    const load = createLiveFetch(fetcher);
    await load("/list");
    expect((await load("/list")).status).toBe(503);
    await load("/list");
    expect(fetcher.mock.calls[2][0]).toBe("/list?pollVersion=v1");
    vi.advanceTimersByTime(5 * 60_000);
    await load("/list");
    expect(fetcher.mock.calls[3][0]).toBe("/list?pollVersion=");
  });
});
