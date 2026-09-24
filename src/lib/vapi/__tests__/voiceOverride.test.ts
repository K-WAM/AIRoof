import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateAssistantPersona } from "../vapiClient";

const en = { provider: "11labs" as const, voiceId: "warm_voice", model: "eleven_turbo_v2" };
const es = { provider: "cartesia" as const, voiceId: "voz-es" };

function patchBodies() {
  return vi.mocked(fetch).mock.calls
    .filter(([, init]) => init?.method === "PATCH")
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
}

beforeEach(() => {
  vi.stubEnv("VAPI_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return { ok: true };
    return {
      ok: true,
      json: async () => ({
        model: { provider: "openai", model: "gpt-4o-mini", toolIds: ["tool-1"] },
        transcriber: { provider: "deepgram", model: "flux" },
        startSpeakingPlan: { numWords: 2, backoffSeconds: 0.7 },
        stopSpeakingPlan: { waitSeconds: 0.1 },
      }),
    };
  }));
});

describe("per-language persona voice overrides", () => {
  it("omits voice when no override exists and preserves both speaking plans", async () => {
    await updateAssistantPersona({ assistantId: "assistant", firstMessage: "hi", systemPrompt: "prompt" });
    const body = patchBodies()[0];
    expect(body).not.toHaveProperty("voice");
    expect(body.startSpeakingPlan).toEqual({ numWords: 2, backoffSeconds: 0.7 });
    expect(body.stopSpeakingPlan).toEqual({ waitSeconds: 0.1 });
  });

  it("sends the exact English voice", async () => {
    await updateAssistantPersona({ assistantId: "assistant", firstMessage: "hi", systemPrompt: "prompt", voiceConfig: { voice: { en } } });
    expect(patchBodies()[0].voice).toEqual(en);
  });

  it("selects the configured voice when flipping Spanish and English", async () => {
    const voiceConfig = { voice: { en, es } };
    for (const transcriberLanguage of ["es", "en"] as const) {
      await updateAssistantPersona({ assistantId: "assistant", firstMessage: "hi", systemPrompt: "prompt", transcriberLanguage, voiceConfig });
    }
    expect(patchBodies().map((body) => body.voice)).toEqual([es, en]);
    expect(patchBodies().map((body) => body.transcriber)).toEqual([
      { provider: "deepgram", model: "flux", language: "es" },
      { provider: "deepgram", model: "flux", language: "en" },
    ]);
  });

  it("does not send stale voice when the next language has no override", async () => {
    const voiceConfig = { voice: { en } };
    await updateAssistantPersona({ assistantId: "assistant", firstMessage: "hi", systemPrompt: "prompt", transcriberLanguage: "en", voiceConfig });
    await updateAssistantPersona({ assistantId: "assistant", firstMessage: "hola", systemPrompt: "prompt", transcriberLanguage: "es", voiceConfig });
    expect(patchBodies()[0].voice).toEqual(en);
    expect(patchBodies()[1]).not.toHaveProperty("voice");
  });
});
