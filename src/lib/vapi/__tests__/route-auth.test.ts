import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetRateLimitState } from "@/lib/auth/rateLimit";

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
    // This file's suite shares one module-level rate-limit bucket map (no
    // vi.resetModules() here) — reset it per test for isolation.
    _resetRateLimitState();
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

  it("uses only Vapi call metadata as lookup identity", async () => {
    const { db } = createReplayDb();
    mocks.getAdminFirestore.mockReturnValue(db);
    mocks.findBusinessByVapiPhoneNumberId.mockResolvedValue(null);
    mocks.findBusinessByVapiAssistantId.mockResolvedValue("biz_123");
    mocks.getBusinessTimezone.mockResolvedValue("America/Los_Angeles");
    mocks.lookupAppointment.mockResolvedValue("safe appointment summary");
    const payload = {
      message: {
        type: "tool-calls",
        call: {
          id: "call_lookup",
          assistantId: "assistant_123",
          customer: { number: "+1 (604) 555-1234" },
        },
        toolCalls: [{
          id: "tool_lookup",
          type: "function",
          function: {
            name: "lookupAppointment",
            arguments: {
              callerPhone: "+1 (604) 555-9876",
              callerName: "Guessed Name",
              address: "Guessed Address",
            },
          },
        }],
      },
    };

    const response = await POST(requestFor(payload, "expected-secret"));

    expect(response.status).toBe(200);
    expect(mocks.lookupAppointment).toHaveBeenCalledWith({
      businessId: "biz_123",
      callId: "call_vapi_call_lookup",
      verifiedCallerPhone: "+1 (604) 555-1234",
    });
  });

  it("binds cancellation to Vapi call metadata and returns no appointment ID", async () => {
    const { db } = createReplayDb();
    mocks.getAdminFirestore.mockReturnValue(db);
    mocks.findBusinessByVapiPhoneNumberId.mockResolvedValue(null);
    mocks.findBusinessByVapiAssistantId.mockResolvedValue("biz_123");
    mocks.getBusinessTimezone.mockResolvedValue("America/Los_Angeles");
    mocks.cancelAppointment.mockResolvedValue({
      cancelled: true,
      serviceType: "Roof inspection",
      startTime: Date.UTC(2026, 6, 22, 17, 0, 0),
    });
    const payload = {
      message: {
        type: "tool-calls",
        call: {
          id: "call_cancel",
          assistantId: "assistant_123",
          customer: { number: "+1 (604) 555-1234" },
        },
        toolCalls: [{
          id: "tool_cancel",
          type: "function",
          function: {
            name: "cancelAppointment",
            arguments: {
              callerPhone: "+1 (604) 555-9876",
              appointmentId: "apt_untrusted",
              appointmentNumber: 1,
              confirmCancellation: true,
            },
          },
        }],
      },
    };

    const response = await POST(requestFor(payload, "expected-secret"));
    const body = await response.json() as { results: Array<{ result: string }> };

    expect(response.status).toBe(200);
    expect(mocks.cancelAppointment).toHaveBeenCalledWith({
      businessId: "biz_123",
      callId: "call_vapi_call_cancel",
      verifiedCallerPhone: "+1 (604) 555-1234",
      confirmCancellation: true,
      appointmentNumber: 1,
      appointmentId: "apt_untrusted",
    });
    expect(body.results[0].result).toContain("Roof inspection appointment");
    expect(body.results[0].result).not.toContain("apt_untrusted");
  });

  it("creates a lead instead of disclosing data when caller ID is unavailable", async () => {
    const { db } = createReplayDb();
    mocks.getAdminFirestore.mockReturnValue(db);
    mocks.findBusinessByVapiPhoneNumberId.mockResolvedValue(null);
    mocks.findBusinessByVapiAssistantId.mockResolvedValue("biz_123");
    mocks.getBusinessTimezone.mockResolvedValue("America/Los_Angeles");
    mocks.createLead.mockResolvedValue({ callerName: "Unknown caller" });
    mocks.logAgentAction.mockResolvedValue(undefined);
    const payload = {
      message: {
        type: "tool-calls",
        call: { id: "call_blocked", assistantId: "assistant_123", customer: {} },
        toolCalls: [{
          id: "tool_blocked",
          type: "function",
          function: {
            name: "lookupAppointment",
            arguments: { callerName: "Guessed Name", address: "Guessed Address" },
          },
        }],
      },
    };

    const response = await POST(requestFor(payload, "expected-secret"));
    const body = await response.json() as { results: Array<{ result: string }> };

    expect(response.status).toBe(200);
    expect(body.results[0].result).toBe(
      "I can't verify you from caller ID — the office will call back."
    );
    expect(mocks.lookupAppointment).not.toHaveBeenCalled();
    expect(mocks.createLead).toHaveBeenCalledWith(expect.objectContaining({
      businessId: "biz_123",
      callerName: "Guessed Name",
      sourceCallId: "call_vapi_call_blocked",
    }));
    expect(mocks.createLead.mock.calls[0][0].callerPhone).toBeUndefined();
  });

  it("429s a burst past the per-IP webhook budget, independent of auth outcome", async () => {
    const burstFrom = (ip: string) =>
      POST(new NextRequest("http://localhost/api/webhooks/vapi", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify(toolPayload),
      }));

    for (let i = 0; i < 300; i++) {
      const response = await burstFrom("11.11.11.11");
      expect(response.status).toBe(401); // under budget — normal unauthenticated rejection
    }

    const blocked = await burstFrom("11.11.11.11");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    expect(mocks.getAdminFirestore).not.toHaveBeenCalled(); // never got past the budget check

    // A different IP is unaffected by this one's burst.
    const other = await burstFrom("12.12.12.12");
    expect(other.status).toBe(401);
  });
});
