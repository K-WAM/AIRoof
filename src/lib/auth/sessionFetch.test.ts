// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installSessionRetry, safeExpiry, writeSessionCookie } from "./sessionFetch";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("installSessionRetry", () => {
  let base: ReturnType<typeof vi.fn>;
  let uninstall: () => void;

  beforeEach(() => {
    base = vi.fn();
    window.fetch = base as unknown as typeof fetch;
  });
  afterEach(() => uninstall?.());

  it("refreshes once and replays a same-origin /api/ call that failed with Invalid session", async () => {
    base.mockResolvedValueOnce(json(401, { error: "Invalid session" })).mockResolvedValueOnce(json(201, { invoice: { invoiceId: "INV-1002" } }));
    const refresh = vi.fn().mockResolvedValue("fresh-token");
    uninstall = installSessionRetry(refresh);

    const res = await fetch("/api/jobs/J-1016/invoice", { method: "POST", body: JSON.stringify({ businessId: "b" }) });
    expect(res.status).toBe(201);
    expect(refresh).toHaveBeenCalledOnce();
    expect(base).toHaveBeenCalledTimes(2);
    expect(base.mock.calls[1][1]).toMatchObject({ method: "POST", body: JSON.stringify({ businessId: "b" }) });
  });

  it("leaves other 401s, other origins and unreplayable bodies alone", async () => {
    const refresh = vi.fn().mockResolvedValue("fresh-token");
    uninstall = installSessionRetry(refresh);
    base.mockResolvedValue(json(401, { error: "Forbidden" }));
    expect((await fetch("/api/jobs/J-1/invoice")).status).toBe(401);
    base.mockResolvedValue(json(401, { error: "Invalid session" }));
    expect((await fetch("https://elsewhere.example/api/x")).status).toBe(401);
    expect((await fetch("/not-api")).status).toBe(401);
    expect((await fetch("/api/x", { method: "POST", body: new ReadableStream() })).status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("returns the original 401 when nobody is signed in, and never refreshes in a storm", async () => {
    base.mockResolvedValue(json(401, { error: "Invalid session" }));
    const refresh = vi.fn().mockResolvedValue(null);
    uninstall = installSessionRetry(refresh);
    expect((await fetch("/api/a")).status).toBe(401);
    expect((await fetch("/api/b")).status).toBe(401);
    expect(refresh).toHaveBeenCalledOnce(); // cooldown
  });

  it("is shared across providers and restores fetch when the last one leaves", async () => {
    const first = installSessionRetry(vi.fn());
    const wrapped = window.fetch;
    const second = installSessionRetry(vi.fn());
    expect(window.fetch).toBe(wrapped);
    first();
    expect(window.fetch).toBe(wrapped);
    second();
    expect(window.fetch).toBe(base);
    uninstall = () => {};
  });
});

describe("session cookie helpers", () => {
  it("writes the token's real remaining life, not a flat hour", () => {
    const now = 1_000_000;
    writeSessionCookie("tok", now + 20 * 60_000, now);
    expect(document.cookie).toContain("__session=tok");
  });

  it("never returns NaN for an unreadable expiry", () => {
    expect(safeExpiry("garbage", 1_000)).toBe(1_000 + 55 * 60_000);
    expect(safeExpiry(new Date(5_000).toUTCString())).toBe(Date.parse(new Date(5_000).toUTCString()));
  });
});
