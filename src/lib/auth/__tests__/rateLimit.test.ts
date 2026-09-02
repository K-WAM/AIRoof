import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { _resetRateLimitState, checkRateLimit } from "@/lib/auth/rateLimit";

function requestFrom(ip: string): NextRequest {
  return new NextRequest("http://localhost/api/whatever", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("checkRateLimit", () => {
  beforeEach(() => {
    _resetRateLimitState();
  });

  it("allows requests under the budget", () => {
    const config = { windowMs: 60_000, max: 3, keyPrefix: "test" };
    const req = requestFrom("1.1.1.1");
    expect(checkRateLimit(req, config)).toBeNull();
    expect(checkRateLimit(req, config)).toBeNull();
    expect(checkRateLimit(req, config)).toBeNull();
  });

  it("returns 429 with Retry-After once the budget is exceeded", () => {
    const config = { windowMs: 60_000, max: 3, keyPrefix: "test" };
    const req = requestFrom("2.2.2.2");
    checkRateLimit(req, config);
    checkRateLimit(req, config);
    checkRateLimit(req, config);

    const blocked = checkRateLimit(req, config);
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
    expect(blocked!.headers.get("Retry-After")).toBeTruthy();
  });

  it("keeps blocking every request past the threshold, not just the first one over", () => {
    const config = { windowMs: 60_000, max: 2, keyPrefix: "test" };
    const req = requestFrom("3.3.3.3");
    checkRateLimit(req, config);
    checkRateLimit(req, config);

    expect(checkRateLimit(req, config)?.status).toBe(429);
    expect(checkRateLimit(req, config)?.status).toBe(429);
    expect(checkRateLimit(req, config)?.status).toBe(429);
  });

  it("tracks separate IPs independently — one client's burst never throttles another", () => {
    const config = { windowMs: 60_000, max: 1, keyPrefix: "test" };
    const a = requestFrom("4.4.4.4");
    const b = requestFrom("5.5.5.5");

    expect(checkRateLimit(a, config)).toBeNull();
    expect(checkRateLimit(a, config)?.status).toBe(429); // a is now over budget
    expect(checkRateLimit(b, config)).toBeNull(); // b is unaffected
  });

  it("keeps separate routes (keyPrefix) from sharing a budget for the same IP", () => {
    const req = requestFrom("6.6.6.6");
    const routeA = { windowMs: 60_000, max: 1, keyPrefix: "route-a" };
    const routeB = { windowMs: 60_000, max: 1, keyPrefix: "route-b" };

    expect(checkRateLimit(req, routeA)).toBeNull();
    expect(checkRateLimit(req, routeA)?.status).toBe(429); // route A exhausted
    expect(checkRateLimit(req, routeB)).toBeNull(); // route B has its own budget
  });

  it("resets the count once the window elapses", async () => {
    const config = { windowMs: 30, max: 1, keyPrefix: "test" };
    const req = requestFrom("7.7.7.7");

    expect(checkRateLimit(req, config)).toBeNull();
    expect(checkRateLimit(req, config)?.status).toBe(429);

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(checkRateLimit(req, config)).toBeNull();
  });

  it("falls back to x-real-ip, then a shared bucket, when x-forwarded-for is absent", () => {
    const config = { windowMs: 60_000, max: 1, keyPrefix: "test" };
    const req = new NextRequest("http://localhost/api/whatever", {
      headers: { "x-real-ip": "8.8.8.8" },
    });

    expect(checkRateLimit(req, config)).toBeNull();
    expect(checkRateLimit(req, config)?.status).toBe(429);
  });
});
