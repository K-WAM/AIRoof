import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

interface MockHeaders {
  get: (name: string) => string | null;
  keys: () => string[];
}

const mockRequest = (headers: Record<string, string>): NextRequest => {
  const lowercased: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lowercased[k.toLowerCase()] = v;
  }
  return {
    headers: {
      get: (name: string) => lowercased[name.toLowerCase()] ?? null,
      keys: () => Object.keys(lowercased),
    } satisfies MockHeaders,
  } as unknown as NextRequest;
};

describe("requireCronAuth", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 500 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const { requireCronAuth } = await import("@/lib/auth/cronGuard");
    const result = requireCronAuth(mockRequest({}));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(500);
    const body = await result!.json();
    expect(body.error).toBe("Cron authentication is not configured");
  });

  it("returns 500 when CRON_SECRET is empty string", async () => {
    process.env.CRON_SECRET = "";
    const { requireCronAuth } = await import("@/lib/auth/cronGuard");
    const result = requireCronAuth(mockRequest({}));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(500);
  });

  it("returns 401 when Authorization header is missing", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const { requireCronAuth } = await import("@/lib/auth/cronGuard");
    const result = requireCronAuth(mockRequest({}));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("returns 401 when Bearer token does not match", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const { requireCronAuth } = await import("@/lib/auth/cronGuard");
    const result = requireCronAuth(
      mockRequest({ authorization: "Bearer wrong-secret" }),
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("returns 401 when Authorization header uses a non-Bearer scheme", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const { requireCronAuth } = await import("@/lib/auth/cronGuard");
    const result = requireCronAuth(
      mockRequest({ authorization: "Basic YWxhZGRpbjpvcGVuc2VzYW1l" }),
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("returns 401 when Bearer token is empty", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const { requireCronAuth } = await import("@/lib/auth/cronGuard");
    const result = requireCronAuth(
      mockRequest({ authorization: "Bearer " }),
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("returns 401 when Authorization header has only 'Bearer' with no token", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const { requireCronAuth } = await import("@/lib/auth/cronGuard");
    const result = requireCronAuth(
      mockRequest({ authorization: "Bearer" }),
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("returns null when Bearer token matches the configured secret", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const { requireCronAuth } = await import("@/lib/auth/cronGuard");
    const result = requireCronAuth(
      mockRequest({ authorization: "Bearer correct-secret" }),
    );
    expect(result).toBeNull();
  });

  it("handles case-insensitive Bearer prefix", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const { requireCronAuth } = await import("@/lib/auth/cronGuard");
    const result = requireCronAuth(
      mockRequest({ authorization: "bearer correct-secret" }),
    );
    expect(result).toBeNull();
  });

  it("handles case-insensitive authorization header name", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const { requireCronAuth } = await import("@/lib/auth/cronGuard");
    const result = requireCronAuth(
      mockRequest({ Authorization: "Bearer correct-secret" }),
    );
    expect(result).toBeNull();
  });

  it("rejects a token that is a substring prefix of the real secret", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const { requireCronAuth } = await import("@/lib/auth/cronGuard");
    const result = requireCronAuth(
      mockRequest({ authorization: "Bearer correct-secr" }),
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });
});
