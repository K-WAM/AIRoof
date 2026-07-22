import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("registry", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("isProviderReady", () => {
    it("reports openai not configured when missing key", async () => {
      const { isProviderReady } = await import("@/lib/ai/registry");
      expect(isProviderReady("openai")).toBe(false);
    });

    it("reports openai configured when key is set", async () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-test");
      const { isProviderReady } = await import("@/lib/ai/registry");
      expect(isProviderReady("openai")).toBe(true);
    });

    it("reports deepseek configured when key is set", async () => {
      vi.stubEnv("DEEPSEEK_API_KEY", "sk-test");
      const { isProviderReady } = await import("@/lib/ai/registry");
      expect(isProviderReady("deepseek")).toBe(true);
    });

    it("reports deepseek not configured when missing key", async () => {
      const { isProviderReady } = await import("@/lib/ai/registry");
      expect(isProviderReady("deepseek")).toBe(false);
    });

    it("reports openai not configured when key is empty string", async () => {
      vi.stubEnv("OPENAI_API_KEY", "");
      const { isProviderReady } = await import("@/lib/ai/registry");
      expect(isProviderReady("openai")).toBe(false);
    });
  });

  describe("getOpenAIClient / getDeepSeekClient", () => {
    it("returns null for openai client when key is missing", async () => {
      const { getOpenAIClient } = await import("@/lib/ai/registry");
      expect(getOpenAIClient()).toBeNull();
    });

    it("returns null for deepseek client when key is missing", async () => {
      const { getDeepSeekClient } = await import("@/lib/ai/registry");
      expect(getDeepSeekClient()).toBeNull();
    });

    it("returns non-null openai client when key is set", async () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-test");
      const { getOpenAIClient } = await import("@/lib/ai/registry");
      expect(getOpenAIClient()).not.toBeNull();
    });

    it("returns non-null deepseek client when key is set", async () => {
      vi.stubEnv("DEEPSEEK_API_KEY", "sk-test");
      const { getDeepSeekClient } = await import("@/lib/ai/registry");
      expect(getDeepSeekClient()).not.toBeNull();
    });
  });

  describe("requireProvider", () => {
    it("throws when openai is not configured", async () => {
      const { requireProvider } = await import("@/lib/ai/registry");
      expect(() => requireProvider("openai")).toThrow("OpenAI provider is not configured");
    });

    it("throws when deepseek is not configured", async () => {
      const { requireProvider } = await import("@/lib/ai/registry");
      expect(() => requireProvider("deepseek")).toThrow("DeepSeek provider is not configured");
    });

    it("returns client when openai is configured", async () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-test");
      const { requireProvider } = await import("@/lib/ai/registry");
      const client = requireProvider("openai");
      expect(client).toBeDefined();
    });
  });

  describe("selectModel", () => {
    it("returns default model for each operation", async () => {
      const { selectModel } = await import("@/lib/ai/registry");
      const result = selectModel("summarize");
      expect(result.provider).toBe("deepseek");
      expect(result.model).toBe("deepseek-chat");
    });

    it("returns default model for parse-field-update", async () => {
      const { selectModel } = await import("@/lib/ai/registry");
      const result = selectModel("parse-field-update");
      expect(result.provider).toBe("openai");
      expect(result.model).toBe("gpt-4o");
    });

    it("honors DEEPSEEK_MODEL env override", async () => {
      vi.stubEnv("DEEPSEEK_MODEL", "deepseek-v4");
      const { selectModel } = await import("@/lib/ai/registry");
      const result = selectModel("summarize");
      expect(result.provider).toBe("deepseek");
      expect(result.model).toBe("deepseek-v4");
    });

    it("honors OPENAI_MODEL env override", async () => {
      vi.stubEnv("OPENAI_MODEL", "gpt-4.1");
      const { selectModel } = await import("@/lib/ai/registry");
      const result = selectModel("agent-respond");
      expect(result.provider).toBe("openai");
      expect(result.model).toBe("gpt-4.1");
    });

    it("honors backOfficeModel override for deepseek ops", async () => {
      const { selectModel } = await import("@/lib/ai/registry");
      const result = selectModel("summarize", { backOfficeModel: "deepseek-v4" });
      expect(result.provider).toBe("deepseek");
      expect(result.model).toBe("deepseek-v4");
    });

    it("switches to openai when backOfficeModel starts with gpt-", async () => {
      const { selectModel } = await import("@/lib/ai/registry");
      const result = selectModel("summarize", { backOfficeModel: "gpt-4o-mini" });
      expect(result.provider).toBe("openai");
      expect(result.model).toBe("gpt-4o-mini");
    });

    it("honors liveModel override for agent-respond", async () => {
      const { selectModel } = await import("@/lib/ai/registry");
      const result = selectModel("agent-respond", { liveModel: "gpt-4.1" });
      expect(result.provider).toBe("openai");
      expect(result.model).toBe("gpt-4.1");
    });

    it("honors liveModel override for parse-field-update", async () => {
      const { selectModel } = await import("@/lib/ai/registry");
      const result = selectModel("parse-field-update", { liveModel: "gpt-4.1" });
      expect(result.provider).toBe("openai");
      expect(result.model).toBe("gpt-4.1");
    });

    it("returns default for transcribe", async () => {
      const { selectModel } = await import("@/lib/ai/registry");
      const result = selectModel("transcribe");
      expect(result.provider).toBe("openai");
      expect(result.model).toBe("whisper-1");
    });
  });

  describe("selectClient", () => {
    it("returns null client when provider is not configured", async () => {
      const { selectClient } = await import("@/lib/ai/registry");
      const result = selectClient("summarize");
      expect(result.client).toBeNull();
      expect(result.selection.provider).toBe("deepseek");
    });

    it("returns non-null client when provider is configured", async () => {
      vi.stubEnv("DEEPSEEK_API_KEY", "sk-test");
      const { selectClient } = await import("@/lib/ai/registry");
      const result = selectClient("summarize");
      expect(result.client).not.toBeNull();
    });
  });

  describe("canUseMock", () => {
    it("returns false in production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const { canUseMock } = await import("@/lib/ai/registry");
      expect(canUseMock()).toBe(false);
    });

    it("returns true in development", async () => {
      vi.stubEnv("NODE_ENV", "development");
      const { canUseMock } = await import("@/lib/ai/registry");
      expect(canUseMock()).toBe(true);
    });

    it("returns true when NODE_ENV is unset", async () => {
      const { canUseMock } = await import("@/lib/ai/registry");
      expect(canUseMock()).toBe(true);
    });
  });

  describe("mockLabel", () => {
    it("prefixes with [MOCK-<operation>]", async () => {
      const { mockLabel } = await import("@/lib/ai/registry");
      expect(mockLabel("summarize")).toBe("[MOCK-summarize] ");
    });
  });
});
