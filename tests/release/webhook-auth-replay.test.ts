import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeFirestore } from "./support/fakeFirestore";

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

const SECRET = "release-vapi-secret";
const bookingPayload = {
  message: {
    type: "tool-calls",
    call: {
      id: "release-call-1",
      assistantId: "assistant-1",
      customer: { number: "+15555550123" },
    },
    toolCalls: [
      {
        id: "release-tool-1",
        type: "function",
        function: {
          name: "bookAppointment",
          arguments: {
            name: "Taylor",
            startTime: "2030-07-23T10:00:00-04:00",
            endTime: "2030-07-23T11:00:00-04:00",
          },
        },
      },
    ],
  },
};

function webhookRequest(secret?: string): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/vapi", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-vapi-secret": secret } : {}),
    },
    body: JSON.stringify(bookingPayload),
  });
}

describe("release boundary: Vapi authentication and replay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VAPI_WEBHOOK_SECRET", SECRET);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([
    ["missing signature", undefined],
    ["wrong signature", "not-the-secret"],
  ])("rejects %s before Firestore or booking work", async (_name, secret) => {
    const response = await POST(webhookRequest(secret));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.getAdminFirestore).not.toHaveBeenCalled();
    expect(mocks.bookAppointment).not.toHaveBeenCalled();
  });

  it("rejects fail-closed when the webhook secret is not configured", async () => {
    vi.stubEnv("VAPI_WEBHOOK_SECRET", "");

    const response = await POST(webhookRequest(SECRET));

    expect(response.status).toBe(401);
    expect(mocks.getAdminFirestore).not.toHaveBeenCalled();
    expect(mocks.bookAppointment).not.toHaveBeenCalled();
  });

  it("books once for a valid request and returns a no-op for its replay", async () => {
    const firestore = new FakeFirestore();
    mocks.getAdminFirestore.mockReturnValue(firestore);
    mocks.findBusinessByVapiPhoneNumberId.mockResolvedValue(null);
    mocks.findBusinessByVapiAssistantId.mockResolvedValue("biz-1");
    mocks.getBusinessTimezone.mockResolvedValue("America/New_York");
    mocks.bookAppointment.mockResolvedValue({
      appointmentId: "appointment-1",
      callerName: "Taylor",
      startTime: Date.parse("2030-07-23T14:00:00.000Z"),
      pendingConfirmation: true,
    });

    const first = await POST(webhookRequest(SECRET));
    const replay = await POST(webhookRequest(SECRET));

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ duplicate: true });
    expect(mocks.bookAppointment).toHaveBeenCalledOnce();
    expect(
      [...firestore.documents.keys()].filter((path) =>
        path.startsWith("_vapiWebhookEvents/"),
      ),
    ).toHaveLength(1);
  });
});
