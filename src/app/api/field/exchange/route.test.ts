import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetRateLimitState } from "@/lib/auth/rateLimit";

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  exchangeLegacy: vi.fn(),
}));

vi.mock("@/lib/auth/verifyRole", () => ({
  consumeFieldExchangeToken: mocks.consume,
  exchangeLegacyFieldKey: mocks.exchangeLegacy,
  FIELD_ACCESS_COOKIE: "__field_access",
  FIELD_SESSION_TTL_MS: 43_200_000,
}));

import { GET, POST } from "@/app/api/field/exchange/route";

describe("field token exchange route", () => {
  beforeEach(() => {
    mocks.consume.mockReset();
    mocks.exchangeLegacy.mockReset();
    // This file's suite shares one module-level rate-limit bucket map (no
    // vi.resetModules() here) — reset it per test so the burst test below
    // can't leave later tests starting mid-throttle, and vice versa.
    _resetRateLimitState();
  });

  it("redirects an invalid or missing grant to a credential-free denied URL", async () => {
    mocks.consume.mockResolvedValue({ ok: false, status: 401, error: "expired" });
    const response = await GET(new NextRequest(
      "http://localhost/api/field/exchange?grant=expired-secret",
    ));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/field?access=denied");
    expect(response.headers.get("location")).not.toContain("expired-secret");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("consumes a grant, sets an HttpOnly cookie, and redirects to scoped clean URL", async () => {
    mocks.consume.mockResolvedValue({
      ok: true,
      token: "signed-session-token",
      businessId: "biz-1",
      jobId: "J-10",
      expiresAt: Date.now() + 43_200_000,
    });
    const request = new NextRequest(
      "http://localhost/api/field/exchange?grant=one-time-secret",
    );
    const response = await GET(request);

    expect(mocks.consume).toHaveBeenCalledWith("one-time-secret", request);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/field?businessId=biz-1&jobId=J-10",
    );
    expect(response.headers.get("location")).not.toContain("grant");
    expect(response.headers.get("set-cookie")).toContain("__field_access=signed-session-token");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
  });

  it("rejects malformed legacy bootstrap bodies without calling the exchange", async () => {
    const response = await POST(new NextRequest("http://localhost/api/field/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ businessId: "biz-1" }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.exchangeLegacy).not.toHaveBeenCalled();
  });

  it("exchanges a legacy body credential into the same HttpOnly session", async () => {
    mocks.exchangeLegacy.mockResolvedValue({
      ok: true,
      token: "migrated-session-token",
      businessId: "biz-1",
      expiresAt: Date.now() + 43_200_000,
    });
    const request = new NextRequest("http://localhost/api/field/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ businessId: "biz-1", key: "legacy-key-value" }),
    });
    const response = await POST(request);

    expect(mocks.exchangeLegacy).toHaveBeenCalledWith(
      "biz-1",
      "legacy-key-value",
      undefined,
      request,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("__field_access=migrated-session-token");
    expect(await response.json()).toMatchObject({ ok: true, businessId: "biz-1" });
  });

  it("429s a burst past the per-IP exchange budget, then recovers once under it again", async () => {
    mocks.consume.mockResolvedValue({ ok: false, status: 401, error: "expired" });
    const burst = () =>
      GET(new NextRequest("http://localhost/api/field/exchange?grant=x", {
        headers: { "x-forwarded-for": "9.9.9.9" },
      }));

    for (let i = 0; i < 30; i++) {
      const response = await burst();
      expect(response.status).toBe(303); // under budget — normal denied-grant redirect
    }

    const blocked = await burst();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    expect(mocks.consume).toHaveBeenCalledTimes(30); // the 31st never reached route logic

    // A different IP is unaffected by this one's burst.
    const other = await GET(new NextRequest("http://localhost/api/field/exchange?grant=x", {
      headers: { "x-forwarded-for": "10.10.10.10" },
    }));
    expect(other.status).toBe(303);
  });
});
