import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeFirestore } from "./support/fakeFirestore";

const mocks = vi.hoisted(() => ({
  buildAgentPrompt: vi.fn(),
  classifyCallOutcome: vi.fn(),
  findBusinessByVapiAssistantId: vi.fn(),
  findBusinessByVapiPhoneNumberId: vi.fn(),
  getAdminFirestore: vi.fn(),
  resend: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: mocks.getAdminFirestore,
}));
vi.mock("@/lib/vapi/businessLookup", () => ({
  findBusinessByVapiAssistantId: mocks.findBusinessByVapiAssistantId,
  findBusinessByVapiPhoneNumberId: mocks.findBusinessByVapiPhoneNumberId,
}));
vi.mock("@/lib/ai/deepseekClient", () => ({
  classifyCallOutcome: mocks.classifyCallOutcome,
}));
vi.mock("@/lib/ai/agentPromptBuilder", () => ({
  buildAgentPrompt: mocks.buildAgentPrompt,
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.resend };
  },
}));

import { POST } from "@/app/api/webhooks/vapi/route";

const WEBHOOK_SECRET = "release-vapi-secret";

function escalationRequest(toolCallId: string): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/vapi", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vapi-secret": WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      message: {
        type: "tool-calls",
        call: {
          id: "same-logical-call",
          assistantId: "assistant-1",
          customer: { number: "+15555550123" },
        },
        toolCalls: [
          {
            id: toolCallId,
            type: "function",
            function: {
              name: "escalateCall",
              arguments: {
                reason: "Urgent service issue",
                summary: "Caller requested urgent help",
              },
            },
          },
        ],
      },
    }),
  });
}

describe("release boundary: ledger-backed duplicate suppression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VAPI_WEBHOOK_SECRET", WEBHOOK_SECRET);
    vi.stubEnv("RESEND_API_KEY", "release-resend-key");
    vi.stubEnv("RESEND_FROM", "Luxor AI <no-reply@luxordev.com>");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not send twice for distinct webhook deliveries of one logical escalation", async () => {
    const firestore = new FakeFirestore();
    firestore.documents.set("businesses/biz-1", {
      businessName: "Example Services",
      escalationPhone: "+15555550100",
      notificationEmail: "dispatch@example.com",
      timezone: "America/New_York",
    });
    mocks.getAdminFirestore.mockReturnValue(firestore);
    mocks.findBusinessByVapiPhoneNumberId.mockResolvedValue(null);
    mocks.findBusinessByVapiAssistantId.mockResolvedValue("biz-1");
    mocks.resend.mockResolvedValue({
      data: { id: "resend-release-1" },
      error: null,
    });

    const first = await POST(escalationRequest("delivery-1"));
    const duplicate = await POST(escalationRequest("delivery-2"));

    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).not.toEqual({ duplicate: true });
    expect(mocks.resend).toHaveBeenCalledOnce();
    expect(
      firestore.documents.get(
        "businesses/biz-1/operations/email:urgent-escalation:call_vapi_same-logical-call",
      ),
    ).toMatchObject({
      state: "succeeded",
      attemptCount: 1,
      lastProviderId: "resend-release-1",
    });
  });
});
