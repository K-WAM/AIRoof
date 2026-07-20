import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: vi.fn(() => null),
}));

describe("GET /api/health", () => {
  it("returns ok status with service statuses", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test");

    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.services).toBeDefined();
    expect(body.services.openai).toBe("configured");
    expect(body.services.deepseek).toBe("configured");

    vi.unstubAllEnvs();
  });

  it("reports not_configured when env vars are missing", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.services.openai).toBe("not_configured");
    expect(body.services.deepseek).toBe("not_configured");
  });
});
