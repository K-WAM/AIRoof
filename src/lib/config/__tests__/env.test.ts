import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("env.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("getEnv", () => {
    it("returns the env value when set", async () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-test");
      const { getEnv } = await import("@/lib/config/env");
      expect(getEnv("OPENAI_API_KEY")).toBe("sk-test");
    });

    it("returns undefined when the env var is missing entirely", async () => {
      const { getEnv } = await import("@/lib/config/env");
      expect(getEnv("OPENAI_API_KEY")).toBeUndefined();
    });

    it("returns undefined when the env var is an empty string", async () => {
      vi.stubEnv("OPENAI_API_KEY", "");
      const { getEnv } = await import("@/lib/config/env");
      expect(getEnv("OPENAI_API_KEY")).toBeUndefined();
    });

    it("returns the value when the env var has whitespace content", async () => {
      vi.stubEnv("OPENAI_API_KEY", "   ");
      const { getEnv } = await import("@/lib/config/env");
      expect(getEnv("OPENAI_API_KEY")).toBe("   ");
    });
  });

  describe("requireEnv", () => {
    it("returns the env value when set", async () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-test");
      const { requireEnv } = await import("@/lib/config/env");
      expect(requireEnv("OPENAI_API_KEY")).toBe("sk-test");
    });

    it("throws in production when the env var is missing", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const { requireEnv } = await import("@/lib/config/env");
      expect(() => requireEnv("OPENAI_API_KEY")).toThrow(
        "Required environment variable OPENAI_API_KEY is not set",
      );
    });

    it("throws in production when the env var is empty", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("OPENAI_API_KEY", "");
      const { requireEnv } = await import("@/lib/config/env");
      expect(() => requireEnv("OPENAI_API_KEY")).toThrow(
        "Required environment variable OPENAI_API_KEY is not set",
      );
    });

    it("warns and returns empty string in non-production when missing", async () => {
      vi.stubEnv("NODE_ENV", "development");
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { requireEnv } = await import("@/lib/config/env");
      expect(requireEnv("OPENAI_API_KEY")).toBe("");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("OPENAI_API_KEY is not set"),
      );
      warnSpy.mockRestore();
    });

    it("returns empty string in non-production even without explicit NODE_ENV", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { requireEnv } = await import("@/lib/config/env");
      expect(requireEnv("OPENAI_API_KEY")).toBe("");
      warnSpy.mockRestore();
    });
  });

  describe("getCapabilityStatus", () => {
    it('returns "configured" when all required vars are set (single-var capability)', async () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-test");
      const { getCapabilityStatus } = await import("@/lib/config/env");
      expect(getCapabilityStatus("openai")).toBe("configured");
    });

    it('returns "not_configured" when a single-var capability is missing', async () => {
      const { getCapabilityStatus } = await import("@/lib/config/env");
      expect(getCapabilityStatus("openai")).toBe("not_configured");
    });

    it('returns "not_configured" when a single-var capability is empty', async () => {
      vi.stubEnv("OPENAI_API_KEY", "");
      const { getCapabilityStatus } = await import("@/lib/config/env");
      expect(getCapabilityStatus("openai")).toBe("not_configured");
    });

    it('returns "configured" only when ALL required vars are set (multi-var capability)', async () => {
      vi.stubEnv("RESEND_API_KEY", "re-test");
      vi.stubEnv("RESEND_FROM", "no-reply@example.com");
      const { getCapabilityStatus } = await import("@/lib/config/env");
      expect(getCapabilityStatus("resend")).toBe("configured");
    });

    it('returns "not_configured" when one of multiple required vars is missing', async () => {
      vi.stubEnv("RESEND_API_KEY", "re-test");
      const { getCapabilityStatus } = await import("@/lib/config/env");
      expect(getCapabilityStatus("resend")).toBe("not_configured");
    });

    it('returns "not_configured" for unknown capability names', async () => {
      const { getCapabilityStatus } = await import("@/lib/config/env");
      expect(getCapabilityStatus("nonexistent")).toBe("not_configured");
    });

    it("cron capability requires CRON_SECRET", async () => {
      const mod1 = await import("@/lib/config/env");
      expect(mod1.getCapabilityStatus("cron")).toBe("not_configured");

      vi.stubEnv("CRON_SECRET", "secret123");
      vi.resetModules();
      const mod2 = await import("@/lib/config/env");
      expect(mod2.getCapabilityStatus("cron")).toBe("configured");
    });
  });

  describe("getCapabilityReport", () => {
    it("returns a report for all known capabilities", async () => {
      const { getCapabilityReport } = await import("@/lib/config/env");
      const report = getCapabilityReport();
      expect(report).toHaveProperty("openai");
      expect(report).toHaveProperty("deepseek");
      expect(report).toHaveProperty("resend");
      expect(report).toHaveProperty("vapi");
      expect(report).toHaveProperty("firebase");
      expect(report).toHaveProperty("cron");
    });

    it("never includes env values in the report", async () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-very-secret-value");
      const { getCapabilityReport } = await import("@/lib/config/env");
      const report = getCapabilityReport();
      const json = JSON.stringify(report);
      expect(json).not.toContain("sk-very-secret-value");
      expect(json).not.toContain("OPENAI_API_KEY");
    });

    it("reports all as not_configured when nothing is set", async () => {
      const { getCapabilityReport } = await import("@/lib/config/env");
      const report = getCapabilityReport();
      for (const status of Object.values(report)) {
        expect(status).toBe("not_configured");
      }
    });

    it("reports configured when all vars are present", async () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-test");
      vi.stubEnv("DEEPSEEK_API_KEY", "ds-test");
      vi.stubEnv("RESEND_API_KEY", "re-test");
      vi.stubEnv("RESEND_FROM", "no-reply@example.com");
      vi.stubEnv("VAPI_API_KEY", "vapi-test");
      vi.stubEnv("VAPI_WEBHOOK_SECRET", "wh-secret");
      vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", "{}");
      vi.stubEnv("CRON_SECRET", "cron-secret");
      const { getCapabilityReport } = await import("@/lib/config/env");
      const report = getCapabilityReport();
      for (const status of Object.values(report)) {
        expect(status).toBe("configured");
      }
    });
  });
});
