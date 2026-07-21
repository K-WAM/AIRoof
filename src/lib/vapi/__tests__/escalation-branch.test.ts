import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  escalateCall: vi.fn(),
  logAgentAction: vi.fn(),
  getBusinessTimezone: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: vi.fn(() => ({})),
}));
vi.mock("@/lib/vapi/verify", () => ({
  verifyVapiWebhook: vi.fn(() => true),
  claimVapiWebhookEvent: vi.fn(async () => "claimed"),
}));
vi.mock("@/lib/vapi/businessLookup", () => ({
  findBusinessByVapiAssistantId: vi.fn(async () => "biz-1"),
  findBusinessByVapiPhoneNumberId: vi.fn(async () => null),
}));
vi.mock("@/lib/tools/agentTools", () => ({
  bookAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
  checkAvailability: vi.fn(),
  createLead: vi.fn(),
  escalateCall: mocks.escalateCall,
  getBusinessTimezone: mocks.getBusinessTimezone,
  getCurrentDate: vi.fn(),
  logAgentAction: mocks.logAgentAction,
  lookupAppointment: vi.fn(),
}));
vi.mock("@/lib/ai/deepseekClient", () => ({
  classifyCallOutcome: vi.fn(),
}));
vi.mock("@/lib/ai/agentPromptBuilder", () => ({
  buildAgentPrompt: vi.fn(),
}));

import { POST } from "@/app/api/webhooks/vapi/route";

function escalationRequest() {
  return new NextRequest("http://localhost/api/webhooks/vapi", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        type: "tool-calls",
        call: {
          id: "urgent-1",
          assistantId: "assistant-1",
          customer: { number: "+15555550199" },
        },
        toolCalls: [
          {
            id: "tool-urgent-1",
            type: "function",
            function: {
              name: "escalateCall",
              arguments: {
                reason: "Caller reported an emergency",
                summary: "Immediate help requested",
              },
            },
          },
        ],
      },
    }),
  });
}

describe("Vapi escalation reply truthfulness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBusinessTimezone.mockResolvedValue("America/New_York");
    mocks.logAgentAction.mockResolvedValue(undefined);
  });

  it.each([
    ["delivered", true, "success", "was notified by email"],
    ["accepted", false, "pending", "can't confirm notification delivery yet"],
    ["failed", false, "failed", "couldn't confirm the team was notified"],
    ["unconfigured", false, "failed", "couldn't confirm the team was notified"],
  ] as const)(
    "maps %s delivery state to a truthful stable reply",
    async (status, escalated, actionStatus, expectedCopy) => {
      const output = {
        status,
        escalated,
        escalationTarget: status === "unconfigured" ? "unconfigured" : "+15555550100",
        operationId: "email:urgent-escalation:call_vapi_urgent-1",
        callId: "call_vapi_urgent-1",
      };
      mocks.escalateCall.mockResolvedValue(output);

      const response = await POST(escalationRequest());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({
        results: [
          {
            toolCallId: "tool-urgent-1",
            result: expect.any(String),
          },
        ],
      });
      const reply = body.results[0].result as string;
      expect(reply).toContain(expectedCopy);
      expect(reply).toContain("can't promise a response time");
      expect(reply).not.toContain("within 15 minutes");
      expect(reply).not.toContain("will call back");
      expect(mocks.logAgentAction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "escalateCall",
          output,
          status: actionStatus,
        })
      );
    }
  );
});
