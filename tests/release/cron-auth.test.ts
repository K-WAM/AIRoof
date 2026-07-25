import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateFaqSuggestions: vi.fn(),
  getAdminFirestore: vi.fn(),
  initiateVapiCall: vi.fn(),
  summarizeTranscript: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: mocks.getAdminFirestore,
}));
vi.mock("@/lib/vapi/vapiClient", () => ({
  initiateVapiCall: mocks.initiateVapiCall,
}));
vi.mock("@/lib/ai/deepseekClient", () => ({
  generateFaqSuggestions: mocks.generateFaqSuggestions,
  summarizeTranscript: mocks.summarizeTranscript,
}));

import { POST as dailyCallSummary } from "@/app/api/cron/daily-call-summary/route";
import { POST as faqSuggestions } from "@/app/api/cron/faq-suggestions/route";
import { GET as followUpCalls } from "@/app/api/cron/follow-up-calls/route";
import { POST as retention } from "@/app/api/cron/retention/route";

const CRON_SECRET = "release-cron-secret";

function cronRequest(
  path: string,
  method: "GET" | "POST",
  token?: string,
): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
    },
    ...(method === "POST"
      ? { body: JSON.stringify({ businessId: "biz-1" }) }
      : {}),
  });
}

const routes = [
  {
    name: "daily-call-summary",
    invoke: (token?: string) =>
      dailyCallSummary(
        cronRequest("/api/cron/daily-call-summary", "POST", token),
      ),
  },
  {
    name: "faq-suggestions",
    invoke: (token?: string) =>
      faqSuggestions(
        cronRequest("/api/cron/faq-suggestions", "POST", token),
      ),
  },
  {
    name: "follow-up-calls",
    invoke: (token?: string) =>
      followUpCalls(
        cronRequest("/api/cron/follow-up-calls", "GET", token),
      ),
  },
  {
    name: "retention",
    invoke: (token?: string) =>
      retention(cronRequest("/api/cron/retention", "POST", token)),
  },
];

describe("release boundary: cron authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(routes)("returns 401 without a Bearer token: $name", async ({ invoke }) => {
    const response = await invoke();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.getAdminFirestore).not.toHaveBeenCalled();
    expect(mocks.initiateVapiCall).not.toHaveBeenCalled();
    expect(mocks.summarizeTranscript).not.toHaveBeenCalled();
    expect(mocks.generateFaqSuggestions).not.toHaveBeenCalled();
  });

  it.each(routes)("returns 401 for a wrong Bearer token: $name", async ({ invoke }) => {
    const response = await invoke("wrong-secret");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.getAdminFirestore).not.toHaveBeenCalled();
    expect(mocks.initiateVapiCall).not.toHaveBeenCalled();
    expect(mocks.summarizeTranscript).not.toHaveBeenCalled();
    expect(mocks.generateFaqSuggestions).not.toHaveBeenCalled();
  });
});
