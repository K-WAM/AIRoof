import { describe, it, expect, vi, beforeEach } from "vitest";

interface MockHeaders {
  get: (name: string) => string | null;
  keys: () => string[];
}

const mockRequest = (headers: Record<string, string>): { headers: MockHeaders } => ({
  headers: {
    get: (name: string) => headers[name.toLowerCase()] ?? null,
    keys: () => Object.keys(headers),
  },
});

describe("verifyVapiWebhook", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns true when bypass is active", async () => {
    vi.stubEnv("VAPI_AUTH_BYPASS", "true");
    const { verifyVapiWebhook } = await import("@/lib/vapi/verify");
    expect(verifyVapiWebhook(mockRequest({}))).toBe(true);
    vi.unstubAllEnvs();
  });

  it("returns false when no secret and no bypass", async () => {
    vi.stubEnv("VAPI_WEBHOOK_SECRET", "s3cret");
    vi.stubEnv("VAPI_AUTH_BYPASS", "false");
    const { verifyVapiWebhook } = await import("@/lib/vapi/verify");
    expect(verifyVapiWebhook(mockRequest({}))).toBe(false);
    vi.unstubAllEnvs();
  });
});
