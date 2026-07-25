import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminFirestore: vi.fn(),
  openAiConstructor: vi.fn(),
  toFile: vi.fn(),
  verifyFieldAccess: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: mocks.getAdminFirestore,
}));
vi.mock("@/lib/auth/verifyRole", () => ({
  verifyFieldAccess: mocks.verifyFieldAccess,
}));
vi.mock("openai", () => ({
  default: class {
    constructor() {
      mocks.openAiConstructor();
    }
  },
}));
vi.mock("openai/uploads", () => ({
  toFile: mocks.toFile,
}));

function jsonRequest(path: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("release boundary: provider-key readiness", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports transcription unavailable without constructing a provider client", async () => {
    const { isProviderReady } = await import("@/lib/ai/registry");
    const { POST } = await import("@/app/api/transcribe/route");

    expect(isProviderReady("openai")).toBe(false);
    const response = await POST(
      jsonRequest("/api/transcribe", {
        businessId: "biz-1",
        audioBase64: "dGVzdA==",
        mimeType: "audio/webm",
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "OpenAI provider not configured — transcription unavailable",
    });
    expect(mocks.verifyFieldAccess).not.toHaveBeenCalled();
    expect(mocks.openAiConstructor).not.toHaveBeenCalled();
    expect(mocks.toFile).not.toHaveBeenCalled();
  });

  it("reports field audio unavailable without writing or silently mocking", async () => {
    const collection = vi.fn(() => ({}));
    mocks.verifyFieldAccess.mockResolvedValue({
      uid: "field-user",
      businessId: "biz-1",
    });
    mocks.getAdminFirestore.mockReturnValue({ collection });
    const { POST } = await import("@/app/api/jobs/[jobId]/field-audio/route");

    const response = await POST(
      jsonRequest("/api/jobs/job-1/field-audio", {
        businessId: "biz-1",
        audioBase64: "dGVzdA==",
        mimeType: "audio/webm",
      }),
      { params: Promise.resolve({ jobId: "job-1" }) },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "OpenAI provider not configured — transcription unavailable",
    });
    expect(collection).toHaveBeenCalledOnce();
    expect(mocks.openAiConstructor).not.toHaveBeenCalled();
    expect(mocks.toFile).not.toHaveBeenCalled();
  });
});
