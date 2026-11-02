// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureResult } from "posthog-js";
import { analyticsContext, bindAnalytics, eligibleClient, setAnalyticsBusiness, setAnalyticsUser, track } from "./client";
import { beforeSend, replayAllowed, REPLAY_SAMPLE } from "./filter";

const business = { businessId: "client-1", industry: "roofing", subscriptionStatus: "active", isDemo: false };
const user = { uid: "uid-1", businessId: "client-1", role: "owner" };
const event = (name: string, props = {}) => ({ uuid: "test-event", event: name, properties: { distinct_id: "uid-1", ...props } }) as CaptureResult;
function client() { setAnalyticsUser(user); setAnalyticsBusiness(business); }
beforeEach(() => {
  setAnalyticsUser(null); setAnalyticsBusiness(null); bindAnalytics(null);
  window.history.replaceState({}, "", "/company/dashboard?preview=secret");
});
afterEach(() => { vi.restoreAllMocks(); setAnalyticsUser(null); setAnalyticsBusiness(null); bindAnalytics(null); });
describe("analytics eligibility and tiny helper", () => {
  it("is a no-op before initialization and on unresolved tenants", () => {
    expect(() => track("job_created")).not.toThrow();
    const capture = vi.fn(); bindAnalytics(capture); setAnalyticsUser(user);
    track("job_created"); expect(capture).not.toHaveBeenCalled();
  });
  it.each([
    { superadmin: true }, { role: "superadmin" }, { isSandboxVisitor: true }, { isDemoTrial: true },
  ])("excludes privileged/demo identities %o", (change) => {
    client(); setAnalyticsUser({ ...user, ...change }); expect(eligibleClient()).toBe(false);
  });
  it.each([
    { isDemo: true }, { isDemo: undefined }, { subscriptionStatus: "trial" }, { businessId: "e2e-roofing" },
  ])("excludes demo, trial and old bootstrap data %o", (change) => {
    client(); setAnalyticsBusiness({ ...business, ...change }); expect(eligibleClient()).toBe(false);
  });
  it("captures only eligible clients and tolerates a blocked SDK", () => {
    client(); const capture = vi.fn(); bindAnalytics(capture);
    track("job_created", { job_id: "J-1" });
    expect(capture).toHaveBeenCalledWith("job_created", { job_id: "J-1" });
    bindAnalytics(() => { throw Error("blocked"); }); expect(() => track("job_created")).not.toThrow();
    setAnalyticsUser(null); expect(analyticsContext().user).toBeNull();
  });
});
describe("before_send privacy boundary", () => {
  it("rejects unknown/autocapture/identify events even for an eligible client", () => {
    client(); for (const name of ["$autocapture", "$identify", "accidental_event"]) expect(beforeSend(event(name))).toBeNull();
  });
  it("rejects logged-out company pages and exceptions on public pages", () => {
    expect(beforeSend(event("$pageview"))).toBeNull();
    window.history.replaceState({}, "", "/login?token=secret");
    expect(beforeSend(event("$exception"))).toBeNull();
    expect(beforeSend(event("$pageview"))?.properties.$current_url).toBe("https://crm.luxordev.com/login");
  });
  it("keeps tenant/role and IDs only, never arbitrary text or token URLs", () => {
    client(); const result = beforeSend(event("job_created", { job_id: "J-1", email: "private@test.com", name: "Customer", note: "secret", $current_url: "https://crm.luxordev.com/company/dashboard?token=secret", $set: { email: "secret" } }));
    expect(result?.properties).toMatchObject({ business_id: "client-1", industry: "roofing", role: "owner", job_id: "J-1", $current_url: "https://crm.luxordev.com/company/dashboard" });
    expect(JSON.stringify(result)).not.toMatch(/private|Customer|secret/);
  });
  it("keeps the project token PostHog needs to ingest — without it every event is silently dropped", () => {
    client(); const result = beforeSend(event("job_created", { token: "phc_public_project_key", $lib: "web", $lib_version: "1.0.0", job_id: "J-1" }));
    expect(result?.properties).toMatchObject({ token: "phc_public_project_key", $lib: "web" });
  });
  it("redacts exception values and frame queries", () => {
    client(); const result = beforeSend(event("$exception", { $exception_list: [{ type: "Error", value: "Customer phone", stacktrace: { frames: [{ filename: "https://crm.luxordev.com/app.js?token=secret", lineno: 10, vars: { name: "Customer" } }] } }] }));
    expect(JSON.stringify(result)).toContain("[masked]");
    expect(JSON.stringify(result)).not.toMatch(/Customer|secret/);
  });
  it("scrubs snapshot URLs recursively", () => {
    client(); const result = beforeSend(event("$snapshot", { $snapshot_data: [{ data: { href: "https://crm.luxordev.com/company/dashboard?preview=secret#key" } }] }));
    expect(result?.properties.$snapshot_data).toEqual([{ data: { href: "https://crm.luxordev.com/company/dashboard" } }]);
  });
  it.each(["/field", "/legal/privacy", "/company/field"])("never replays %s", (path) => {
    client(); window.history.replaceState({}, "", path);
    expect(replayAllowed(path)).toBe(false); expect(beforeSend(event("$snapshot"))).toBeNull();
  });
  it("drops excluded users immediately, including queued events", () => {
    client(); setAnalyticsUser({ ...user, superadmin: true }); expect(beforeSend(event("invoice_sent"))).toBeNull();
  });
  it("has one replay sampling constant", () => { expect(REPLAY_SAMPLE).toBe(0.2); });
});
