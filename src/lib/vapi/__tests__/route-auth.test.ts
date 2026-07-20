import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bookAppointment: vi.fn(),
  buildAgentPrompt: vi.fn(),
  cancelAppointment: vi.fn(),
  checkAvailability: vi.fn(),
  classifyCallOutcome: vi.fn(),
  createLead: vi.fn(),
  escalateCall: vi.fn(),
  findBusinessByVapiAssistantId: vi.fn(),
  findBusinessByVapiPhoneNumberId: vi.fn(),
  getAdminFirestore: vi.fn(),
  getBusinessTimezone: vi.fn(),
  getCurrentDate: vi.fn(),
  logAgentAction: vi.fn(),
  lookupAppointment: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: mocks.getAdminFirestore,
}));
vi.mock("@/lib/vapi/businessLookup", () => ({
  findBusinessByVapiAssistantId: mocks.findBusinessByVapiAssistantId,
  findBusinessByVapiPhoneNumberId: mocks.findBusinessByVapiPhoneNumberId,
}));
vi.mock("@/lib/tools/agentTools", () => ({
  bookAppointment: mocks.bookAppointment,
  cancelAppointment: mocks.cancelAppointment,
  checkAvailability: mocks.checkAvailability,
  createLead: mocks.createLead,
  escalateCall: mocks.escalateCall,
  getBusinessTimezone: mocks.getBusinessTimezone,
  getCurrentDate: mocks.getCurrentDate,
  logAgentAction: mocks.logAgentAction,
  lookupAppointment: mocks.lookupAppointment,
}));
vi.mock("@/lib/ai/deepseekClient", () => ({
  classifyCallOutcome: mocks.classifyCallOutcome,
}));
vi.mock("@/lib/ai/agentPromptBuilder", () => ({
  buildAgentPrompt: mocks.buildAgentPrompt,
}));

import { POST } from "@/app/api/webhooks/vapi/route";

function createReplayDb() {
  const claims = new Map<string, Record<string, unknown>>();
  const replayWrite = vi.fn(
    (ref: { id: string }, value: Record<string, unknown>) => claims.set(ref.id, value)
  );
  const db = {
    collection: vi.fn(() => ({ doc: (id: string) => ({ id }) })),
    runTransaction: vi.fn(async <T>(callback: (transaction: {
      get: (ref: { id: string }) => Promise<{
        exists: boolean;
        data: () => Record<string, unknown> | undefined;
      }>;
      set: typeof replayWrite;
    }) => Promise<T>) => callback({
      get: async (ref) => ({
        exists: claims.has(ref.id),
        data: () => claims.get(ref.id),
      }),
      set: replayWrite,
    })),
  };
  return { db, replayWrite };
}

function requestFor(
  payload: Record<string, unknown>,
  secret?: string
): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/vapi", {
    method: "POST",
    headers: secret ? { "content-type": "application/json", "x-vapi-secret": secret } : { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

const toolPayload = {
  message: {
    type: "tool-calls",
    call: {
      id: "call_123",
      assistantId: "assistant_123",
      customer: { number: "+1 (604) 555-1234" },
    },
    toolCalls: [
      {
        id: "tool_call_123",
        type: "function",
        function: { name: "createLead", arguments: { name: "Pat" } },
      },
    ],
  },
};

describe("Vapi route authentication and replay boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VAPI_WEBHOOK_SECRET = "expected-secret";
    delete process.env.VAPI_AUTH_BYPASS;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it.each([
    ["unsigned", undefined, "expected-secret"],
    ["missing configuration", "expected-secret", undefined],
    ["wrong secret", "wrong-secret", "expected-secret"],
    ["altered secret", "expected-secreu", "expected-secret"],
  ])("returns 401 with zero side effects for %s requests", async (_case, header, configured) => {
    if (configured) process.env.VAPI_WEBHOOK_SECRET = configured;
    else delete process.env.VAPI_WEBHOOK_SECRET;

    const response = await POST(requestFor(toolPayload, header));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.getAdminFirestore).not.toHaveBeenCalled();
    expect(mocks.findBusinessByVapiAssistantId).not.toHaveBeenCalled();
    expect(mocks.findBusinessByVapiPhoneNumberId).not.toHaveBeenCalled();
    expect(mocks.bookAppointment).not.toHaveBeenCalled();
    expect(mocks.createLead).not.toHaveBeenCalled();
    expect(mocks.escalateCall).not.toHaveBeenCalled();
    expect(mocks.lookupAppointment).not.toHaveBeenCalled();
    expect(mocks.cancelAppointment).not.toHaveBeenCalled();
    expect(mocks.logAgentAction).not.toHaveBeenCalled();
  });

  it("processes a valid event once and no-ops its replay", async () => {
    const { db, replayWrite } = createReplayDb();
    mocks.getAdminFirestore.mockReturnValue(db);
    mocks.findBusinessByVapiPhoneNumberId.mockResolvedValue(null);
    mocks.findBusinessByVapiAssistantId.mockResolvedValue("biz_123");
    mocks.getBusinessTimezone.mockResolvedValue("America/Los_Angeles");
    mocks.createLead.mockResolvedValue({ callerName: "Pat" });
    mocks.logAgentAction.mockResolvedValue(undefined);

    const first = await POST(requestFor(toolPayload, "expected-secret"));
    const replay = await POST(requestFor(toolPayload, "expected-secret"));

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ duplicate: true });
    expect(mocks.createLead).toHaveBeenCalledOnce();
    expect(replayWrite).toHaveBeenCalledOnce();
  });
});
