// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("data/store", () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("caches a successful fetch and returns it synchronously afterward", async () => {
    const { fetchQuery, getCached } = await import("@/lib/data/store");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ hello: "world" }) }));

    const result = await fetchQuery<{ hello: string }>("k1", "/api/thing");
    expect(result).toEqual({ hello: "world" });
    expect(getCached("k1")?.data).toEqual({ hello: "world" });
  });

  it("single-flights concurrent fetches for the same key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ n: 1 }) });
    vi.stubGlobal("fetch", fetchMock);
    const { fetchQuery } = await import("@/lib/data/store");

    const [a, b] = await Promise.all([
      fetchQuery("k2", "/api/thing"),
      fetchQuery("k2", "/api/thing"),
    ]);
    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the prior data and records the error on a failed fetch", async () => {
    const { fetchQuery, getCached } = await import("@/lib/data/store");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ n: 1 }) }));
    await fetchQuery("k3", "/api/thing");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Server Error" }));
    await expect(fetchQuery("k3", "/api/thing")).rejects.toThrow();

    const entry = getCached<{ n: number }>("k3");
    expect(entry?.data).toEqual({ n: 1 }); // stale-but-present data survives a failed revalidate
    expect(entry?.error).toBeInstanceOf(Error);
  });

  it("invalidate marks every key under a tag as stale and notifies subscribers", async () => {
    const { fetchQuery, invalidate, subscribe, isStale, getCached } = await import("@/lib/data/store");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ n: 1 }) }));
    await fetchQuery("jobs:list", "/api/jobs", { tags: ["jobs"] });

    expect(isStale(getCached("jobs:list"))).toBe(false);

    const cb = vi.fn();
    const unsub = subscribe("jobs:list", cb);
    invalidate("jobs");
    expect(cb).toHaveBeenCalledTimes(1);
    expect(isStale(getCached("jobs:list"))).toBe(true);
    unsub();
  });

  it("invalidate on an unrelated tag leaves other keys untouched", async () => {
    const { fetchQuery, invalidate, isStale, getCached } = await import("@/lib/data/store");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ n: 1 }) }));
    await fetchQuery("customers:list", "/api/customers", { tags: ["customers"] });

    invalidate("jobs");
    expect(isStale(getCached("customers:list"))).toBe(false);
  });

  it("patch optimistically updates the cache without a network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { patch, getCached } = await import("@/lib/data/store");

    patch<{ count: number }>("counter", (prev) => ({ count: (prev?.count ?? 0) + 1 }));
    patch<{ count: number }>("counter", (prev) => ({ count: (prev?.count ?? 0) + 1 }));

    expect(getCached<{ count: number }>("counter")?.data).toEqual({ count: 2 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("persists a successful response to sessionStorage and reads it back as a fresh cache", async () => {
    const { fetchQuery } = await import("@/lib/data/store");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ persisted: true }) }));
    await fetchQuery("persist-me", "/api/thing", { persist: true });

    expect(sessionStorage.getItem("lx:q:persist-me")).toBeTruthy();

    // Simulate a full remount by resetting the in-memory module state only.
    vi.resetModules();
    const { getCached: getCachedFresh } = await import("@/lib/data/store");
    expect(getCachedFresh<{ persisted: boolean }>("persist-me", { persist: true })?.data).toEqual({ persisted: true });
  });

  it("does not persist an entry larger than the size cap", async () => {
    const huge = { blob: "x".repeat(300_000) };
    const { fetchQuery } = await import("@/lib/data/store");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(huge) }));
    await fetchQuery("too-big", "/api/thing", { persist: true });

    expect(sessionStorage.getItem("lx:q:too-big")).toBeNull();
  });

  it("prefetch is a no-op when the cache is already fresh", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ n: 1 }) });
    vi.stubGlobal("fetch", fetchMock);
    const { fetchQuery, prefetch } = await import("@/lib/data/store");

    await fetchQuery("warm", "/api/thing");
    prefetch("warm", "/api/thing");
    // fetchQuery above already resolved and consumed the call; prefetch must not add another.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
