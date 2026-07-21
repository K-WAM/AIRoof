import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: vi.fn(() => null),
}));

describe("GET /api/health", () => {
  it("reports all capabilities as not_configured when no env vars are set", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.firestore).toBe("disconnected");
    expect(body.capabilities).toBeDefined();
    expect(body.capabilities.openai).toBe("not_configured");
    expect(body.capabilities.deepseek).toBe("not_configured");
    expect(body.capabilities.resend).toBe("not_configured");
    expect(body.capabilities.vapi).toBe("not_configured");
    expect(body.capabilities.firebase).toBe("not_configured");
    expect(body.capabilities.cron).toBe("not_configured");
  });

  it("reports configured when env vars are set", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("DEEPSEEK_API_KEY", "ds-test");
    vi.stubEnv("RESEND_API_KEY", "re-test");
    vi.stubEnv("RESEND_FROM", "no-reply@example.com");
    vi.stubEnv("VAPI_API_KEY", "vapi-test");
    vi.stubEnv("VAPI_WEBHOOK_SECRET", "wh-secret");
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", "{}");
    vi.stubEnv("CRON_SECRET", "cron-secret");

    vi.resetModules();
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.capabilities.openai).toBe("configured");
    expect(body.capabilities.deepseek).toBe("configured");
    expect(body.capabilities.resend).toBe("configured");
    expect(body.capabilities.vapi).toBe("configured");
    expect(body.capabilities.firebase).toBe("configured");
    expect(body.capabilities.cron).toBe("configured");

    vi.unstubAllEnvs();
  });

  it("never exposes env values in the response", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-very-secret-value");
    vi.stubEnv("CRON_SECRET", "super-secret-cron-key");

    vi.resetModules();
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();
    const json = JSON.stringify(body);

    expect(json).not.toContain("sk-very-secret-value");
    expect(json).not.toContain("super-secret-cron-key");
    expect(json).not.toContain("OPENAI_API_KEY");
    expect(json).not.toContain("CRON_SECRET");

    vi.unstubAllEnvs();
  });

  it("does not crash when no env vars are set at all", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    expect(response.status).toBe(200);
  });
});
