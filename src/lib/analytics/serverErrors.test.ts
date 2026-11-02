import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ capture: vi.fn(), shutdown: vi.fn(), construct: vi.fn(), after: vi.fn() }));
vi.mock("posthog-node", () => ({ PostHog: class {
  constructor(...args: unknown[]) { sdk.construct(...args); }
  captureException = sdk.capture;
  shutdown = sdk.shutdown;
} }));
vi.mock("next/server", () => ({ after: sdk.after }));
const request = { method: "POST", path: "/api/jobs/private-id?email=alice@example.com", headers: { cookie: "secret" } };
const context = { routePath: "/api/jobs/[jobId]/updates", routeType: "route" as const, routerKind: "App Router" as const, revalidateReason: undefined };

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "public-project-token");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
  vi.stubEnv("E2E_HARNESS", ""); vi.stubEnv("VERCEL", "");
  sdk.shutdown.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("server error privacy and gates", () => {
  it.each(["development", "preview", "test", ""])("does not send in VERCEL_ENV=%s", async (env) => {
    vi.stubEnv("VERCEL_ENV", env);
    const { captureServerError } = await import("./serverErrors");
    await captureServerError(new Error("secret"), request, context);
    expect(sdk.construct).not.toHaveBeenCalled();
  });
  it.each(["missing token", "harness", "tests", "dev"])("does not send with %s", async (gate) => {
    if (gate === "missing token") vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");
    if (gate === "tests") vi.stubEnv("NODE_ENV", "test");
    if (gate === "dev") vi.stubEnv("NODE_ENV", "development");
    if (gate === "harness") {
      vi.stubEnv("E2E_HARNESS", "1"); vi.stubEnv("E2E_HARNESS_PROD", "1");
      vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080");
    }
    const { captureServerError } = await import("./serverErrors");
    await captureServerError(new Error("secret"), request, context);
    expect(sdk.construct).not.toHaveBeenCalled();
  });
  it("retains only masked exception/source data and route template metadata", async () => {
    const { scrubServerError, captureServerError } = await import("./serverErrors");
    const error = new TypeError("Alice alice@example.com +15551234567 secret");
    error.stack = "TypeError: Alice\n    at update (/var/task/.next/server/app/api/jobs/[jobId]/route.js?token=secret:10:20)\n    at unsafe (/home/Alice/private.js:2:3)\n    at alice@example.com (/var/task/src/lib/jobs.ts:4:5)";
    const clean = scrubServerError(error, request, { ...context, routePath: context.routePath + "?token=secret#Alice" });
    expect(clean.$exception_list[0]).toEqual({ type: "TypeError", value: "[masked]", stacktrace: { frames: [
      { filename: "src/lib/jobs.ts", lineno: 4, colno: 5, function: undefined },
      { filename: ".next/server/app/api/jobs/[jobId]/route.js", lineno: 10, colno: 20, function: "update" },
    ] } });
    expect(clean.routePath).toBe(context.routePath);
    expect(JSON.stringify(clean)).not.toMatch(/Alice|alice|15551234567|secret|private-id|headers|cookie/);
    expect(scrubServerError("alice@example.com", request, {}).routePath).toBe("[unknown]");
    await captureServerError(error, request, context);
    expect(sdk.capture).toHaveBeenCalledWith(expect.objectContaining({ message: "[masked]", stack: "" }), "server", { ...clean, token: "public-project-token" });
    expect(sdk.construct).toHaveBeenCalledWith("public-project-token", expect.objectContaining({ host: "https://us.i.posthog.com", flushAt: 1, requestTimeout: 2000, fetchRetryCount: 0 }));
    expect(sdk.shutdown).toHaveBeenCalledWith(2000);
  });
});

describe("server error delivery safety", () => {
  it("deduplicates type+route for a minute and caps all captures at 200 per rolling hour", async () => {
    const { createErrorLimiter, captureServerError } = await import("./serverErrors");
    const allow = createErrorLimiter();
    expect(allow("Error", "/a", 0)).toBe(true);
    expect(allow("Error", "/a", 59_999)).toBe(false);
    expect(allow("Error", "/a", 60_000)).toBe(true);
    for (let i = 0; i < 198; i++) expect(allow("TypeError", `/r${i}`, 60_000)).toBe(true);
    expect(allow("Error", "/new", 120_000)).toBe(false);
    expect(allow("Error", "/new", 3_600_000)).toBe(true);
    await captureServerError(new Error(), request, context);
    await captureServerError(new Error(), request, context);
    expect(sdk.capture).toHaveBeenCalledTimes(1);
  });
  it.each(["construct", "capture", "shutdown"] as const)("swallows %s failures", async (stage) => {
    sdk[stage].mockImplementation(() => { throw Error("offline"); });
    const { captureServerError } = await import("./serverErrors");
    await expect(captureServerError(new Error(), request, context)).resolves.toBeUndefined();
    if (stage === "capture") expect(sdk.shutdown).toHaveBeenCalled();
  });
  it("contains rejected shutdown and aborts stalled transport after two seconds", async () => {
    vi.useFakeTimers();
    const { captureServerError } = await import("./serverErrors");
    sdk.shutdown.mockRejectedValueOnce(new Error("offline"));
    await expect(captureServerError(new Error(), request, context)).resolves.toBeUndefined();
    sdk.shutdown.mockImplementation(() => new Promise(() => {}));
    const pending = captureServerError(new TypeError(), request, context);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(pending).resolves.toBeUndefined();
    const transport = sdk.construct.mock.calls[1][1].fetch;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("aborted"));
    await expect(transport("https://us.i.posthog.com/batch", {})).rejects.toThrow("aborted");
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    fetchMock.mockRestore();
  });
  it("returns immediately and schedules delivery with after, falling back if unavailable", async () => {
    const { onRequestError } = await import("@/instrumentation");
    expect(onRequestError(new Error(), request, context)).toBeUndefined();
    expect(sdk.capture).not.toHaveBeenCalled();
    await sdk.after.mock.calls[0][0]();
    expect(sdk.capture).toHaveBeenCalledTimes(1);
    sdk.after.mockImplementation(() => { throw Error("no request scope"); });
    expect(onRequestError(new TypeError(), request, context)).toBeUndefined();
    await vi.waitFor(() => expect(sdk.capture).toHaveBeenCalledTimes(2));
  });
});
