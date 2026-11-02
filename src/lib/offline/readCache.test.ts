// @vitest-environment jsdom
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheableRead, clearReadCache, fetchWithOfflineCache, offlineReadState, reportConnection } from "./readCache";
import { setOfflineIdentity } from "./identity";
import { installSessionRetry } from "@/lib/auth/sessionFetch";

const user = { uid: "u1", businessId: "biz" };
const route = "/api/jobs?businessId=biz&from=1&to=2";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
let uninstall: (() => void) | undefined;
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory()); vi.stubGlobal("navigator", { onLine: true });
  setOfflineIdentity(user); reportConnection(false); window.history.replaceState({}, "", "/company/jobs");
});
afterEach(() => { uninstall?.(); uninstall = undefined; vi.unstubAllGlobals(); });
const failed = vi.fn(async (): Promise<Response> => { throw new TypeError("Failed to fetch"); });

describe("user-scoped offline read cache", () => {
  it.each(["/api/admin/businesses", "/api/jobs/export", "/api/jobs/%65xport", "/api/jobs/from-request", "/api/jobs/J-1/updates", "/api/jobs/J-1/photos", "/api/jobs/J-1/invoice", "/api/company/customers", "https://other.test/api/jobs"])("excludes %s", path => {
    expect(cacheableRead(new URL(path, location.origin), user)).toBe(false);
  });
  it("excludes previews and other tenants", () => {
    expect(cacheableRead(new URL(route, location.origin), { ...user, preview: true })).toBe(false);
    expect(cacheableRead(new URL("/api/jobs?businessId=other", location.origin), user)).toBe(false);
    expect(cacheableRead(new URL("/api/businesses/other/appointments", location.origin), user)).toBe(false);
    window.history.replaceState({}, "", "/company/calendar?preview=biz");
    expect(cacheableRead(new URL(route, location.origin), user)).toBe(false);
  });
  it.each(["/api/company/bootstrap?businessId=biz", "/api/company/crews?businessId=biz", "/api/company/time-blocks?businessId=biz", "/api/jobs?businessId=biz", "/api/jobs/J-1?businessId=biz", "/api/businesses/biz/appointments?from=1&to=2"])("serves %s with its savedAt and unchanged Cache-Control on network failure", async path => {
    const live = await fetchWithOfflineCache(path, undefined, vi.fn(async () => json({ rows: [1] })));
    expect(live.headers.has("x-luxor-offline")).toBe(false);
    const cached = await fetchWithOfflineCache(path, undefined, failed);
    expect(await cached.json()).toEqual({ rows: [1] });
    expect(Number(cached.headers.get("x-luxor-offline"))).toBeGreaterThan(0);
    expect(cached.headers.get("cache-control")).toBe("private, no-store");
    expect(offlineReadState().disconnected).toBe(true);
  });
  it("keys by exact URL and user, with no fallback on an auth/server error", async () => {
    await fetchWithOfflineCache(route, undefined, vi.fn(async () => json({ secret: "u1" })));
    setOfflineIdentity({ ...user, uid: "u2" });
    await expect(fetchWithOfflineCache(route, undefined, failed)).rejects.toThrow();
    setOfflineIdentity(user);
    await expect(fetchWithOfflineCache("/api/jobs?businessId=biz&from=3", undefined, failed)).rejects.toThrow();
    for (const status of [401,403,500]) expect((await fetchWithOfflineCache(route, undefined, vi.fn(async () => json({ error: "denied" }, status)))).status).toBe(status);
  });
  it("does not save unsuccessful responses or responses that finished after a user switch", async () => {
    await fetchWithOfflineCache(route, undefined, vi.fn(async () => json({ error: "denied" }, 403)));
    await expect(fetchWithOfflineCache(route, undefined, failed)).rejects.toThrow();
    await fetchWithOfflineCache(route, undefined, vi.fn(async () => { setOfflineIdentity({ ...user, uid: "u2" }); return json({ secret: "late u1" }); }));
    setOfflineIdentity(user);
    await expect(fetchWithOfflineCache(route, undefined, failed)).rejects.toThrow();
  });
  it("clears only the signed-out user's cache", async () => {
    await fetchWithOfflineCache(route, undefined, vi.fn(async () => json({ uid: "u1" })));
    setOfflineIdentity({ ...user, uid: "u2" });
    await fetchWithOfflineCache(route, undefined, vi.fn(async () => json({ uid: "u2" })));
    await clearReadCache("u1");
    expect(await (await fetchWithOfflineCache(route, undefined, failed)).json()).toEqual({ uid: "u2" });
    setOfflineIdentity(user); await expect(fetchWithOfflineCache(route, undefined, failed)).rejects.toThrow();
  });
  it("does not replace an aborted request with stale data", async () => {
    await fetchWithOfflineCache(route, undefined, vi.fn(async () => json({ rows: [1] })));
    const controller = new AbortController(); controller.abort();
    await expect(fetchWithOfflineCache(route, { signal: controller.signal }, failed)).rejects.toThrow();
  });
  it("pauses office writes with an explicit error, but lets the durable outbox attempt sending", async () => {
    reportConnection(true);
    const send = vi.fn(async () => json({ ok: true }));
    const res = await fetchWithOfflineCache("/api/jobs/J-1/assign", { method: "PATCH", body: "{}" }, send);
    expect(res.status).toBe(503); expect((await res.json()).error).toContain("not saved"); expect(send).not.toHaveBeenCalled();
    await fetchWithOfflineCache("/api/jobs/J-1/updates", { method: "POST", headers: { "x-offline-owner": "u1" } }, send);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("works inside the global wrapper and still refreshes a 401 session once", async () => {
    const base = vi.fn().mockResolvedValueOnce(json({ error: "Invalid session" }, 401)).mockResolvedValueOnce(json({ jobs: ["J-1"] })).mockRejectedValueOnce(new TypeError("network"));
    window.fetch = base;
    const refresh = vi.fn(async () => "token"); uninstall = installSessionRetry(refresh);
    await window.fetch(route);
    const cached = await window.fetch(route);
    expect(await cached.json()).toEqual({ jobs: ["J-1"] }); expect(refresh).toHaveBeenCalledOnce();
  });
  it("does not claim an office write was definitely unapplied when only its acknowledgement was lost", async () => {
    const response = await fetchWithOfflineCache("/api/jobs/J-1/assign", { method: "PATCH", body: "{}" }, failed);
    expect((await response.json()).error).toContain("couldn't confirm your change");
  });
});
