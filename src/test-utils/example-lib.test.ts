import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

interface MockHeaders {
  get: (name: string) => string | null;
  keys: () => string[];
}

const mockRequest = (headers: Record<string, string>): NextRequest =>
  ({
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
      keys: () => Object.keys(headers),
    } satisfies MockHeaders,
  }) as unknown as NextRequest;

// Deliberately provider-agnostic: this seed test only proves the vitest harness
// (mocking, env stubbing, path aliases) works end to end. Authoritative coverage
// of verifyVapiWebhook's auth semantics lives in src/lib/vapi/__tests__/verify.test.ts.
describe("verifyVapiWebhook (harness smoke test)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns false for a request with no matching secret header", async () => {
    vi.stubEnv("VAPI_WEBHOOK_SECRET", "s3cret");
    const { verifyVapiWebhook } = await import("@/lib/vapi/verify");
    expect(verifyVapiWebhook(mockRequest({}))).toBe(false);
    vi.unstubAllEnvs();
  });

  it("returns true when a header matches the configured secret", async () => {
    vi.stubEnv("VAPI_WEBHOOK_SECRET", "s3cret");
    const { verifyVapiWebhook } = await import("@/lib/vapi/verify");
    expect(verifyVapiWebhook(mockRequest({ "x-vapi-secret": "s3cret" }))).toBe(true);
    vi.unstubAllEnvs();
  });
});
