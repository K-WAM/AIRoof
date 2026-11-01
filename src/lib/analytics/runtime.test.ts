// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostHogConfig, CaptureResult } from "posthog-js";
const sdk = vi.hoisted(() => ({
  init: vi.fn(), capture: vi.fn(), identify: vi.fn(), register: vi.fn(), unregister: vi.fn(), reset: vi.fn(),
  startSessionRecording: vi.fn(), stopSessionRecording: vi.fn(), get_session_id: vi.fn(() => "session-1"),
}));
vi.mock("posthog-js", () => ({ default: sdk }));
let onIdle: () => void;
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "test-token");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
  vi.stubGlobal("window", {
    location: { hostname: "crm.luxordev.com", pathname: "/company/dashboard" },
    requestIdleCallback: (callback: () => void) => { onIdle = callback; return 1; }, cancelIdleCallback: vi.fn(),
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function setup() {
  const context = await import("./client");
  context.setAnalyticsUser({ uid: "user-1", businessId: "business-1", role: "owner" });
  context.setAnalyticsBusiness({ businessId: "business-1", industry: "roofing", subscriptionStatus: "active", isDemo: false });
  const { startAnalytics } = await import("./runtime");
  return { ...context, startAnalytics };
}
describe("deferred analytics lifecycle", () => {
  it("does not initialize on previews or other ingest hosts", async () => {
    const { startAnalytics } = await setup();
    window.location.hostname = "preview.vercel.app"; startAnalytics(); expect(sdk.init).not.toHaveBeenCalled();
    window.location.hostname = "crm.luxordev.com";
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://other.test"); startAnalytics(); expect(sdk.init).not.toHaveBeenCalled();
  });
  it("identifies uid only, registers the business, and waits for idle to start replay", async () => {
    const { startAnalytics, track, setAnalyticsUser } = await setup();
    const stop = startAnalytics();
    expect(sdk.identify).toHaveBeenCalledWith("user-1");
    expect(sdk.register).toHaveBeenCalledWith({ business_id: "business-1", industry: "roofing", role: "owner" });
    expect(sdk.startSessionRecording).not.toHaveBeenCalled();
    onIdle(); expect(sdk.startSessionRecording).toHaveBeenCalled();
    track("invoice_sent", { job_id: "J-1" }); expect(sdk.capture).toHaveBeenCalledWith("invoice_sent", { job_id: "J-1" });
    const count = sdk.capture.mock.calls.length;
    setAnalyticsUser(null); track("invoice_sent"); expect(sdk.capture).toHaveBeenCalledTimes(count);
    expect(sdk.stopSessionRecording).toHaveBeenCalled(); stop();
  });
  it("sets local privacy controls and promotes an exception session beyond sampling", async () => {
    const { startAnalytics } = await setup(); const stop = startAnalytics();
    const config = sdk.init.mock.calls[0][1] as Partial<PostHogConfig>;
    expect(config).toMatchObject({ autocapture: false, capture_exceptions: true, capture_dead_clicks: true, disable_session_recording: true });
    expect(config.session_recording).toMatchObject({ sampleRate: 0.2, maskAllInputs: true, maskTextSelector: "*", maskAllElementAttributes: true, recordBody: false, recordHeaders: false, captureCanvas: { recordCanvas: false } });
    onIdle(); sdk.startSessionRecording.mockClear();
    const exception = { uuid: "test", event: "$exception", properties: {} } as CaptureResult;
    const filter = config.before_send;
    if (typeof filter !== "function") throw Error("Expected one before_send filter");
    filter(exception);
    expect(sdk.startSessionRecording).toHaveBeenCalledWith({ sampling: true, linked_flag: true, url_trigger: true, event_trigger: true });
    window.location.pathname = "/legal/privacy";
    expect(filter(exception)).toBeNull(); stop();
  });
  it("does not initialize for a demo or server-unresolved business", async () => {
    const { startAnalytics, setAnalyticsBusiness } = await setup();
    setAnalyticsBusiness({ businessId: "business-1", industry: "roofing", subscriptionStatus: "active", isDemo: true });
    const stop = startAnalytics(); expect(sdk.init).not.toHaveBeenCalled(); onIdle(); expect(sdk.startSessionRecording).not.toHaveBeenCalled(); stop();
  });
  it("contains SDK failures", async () => {
    const { startAnalytics } = await setup(); sdk.init.mockImplementationOnce(() => { throw Error("blocked"); });
    expect(() => startAnalytics()()).not.toThrow();
  });
});
