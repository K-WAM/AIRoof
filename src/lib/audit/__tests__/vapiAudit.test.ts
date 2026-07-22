import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendAuditEvent: vi.fn(),
  bookAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
  checkAvailability: vi.fn(),
  createLead: vi.fn(),
  escalateCall: vi.fn(),
  getAdminFirestore: vi.fn(),
  getBusinessTimezone: vi.fn(),
  getCurrentDate: vi.fn(),
  logAgentAction: vi.fn(),
  lookupAppointment: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({ appendAuditEvent: mocks.appendAuditEvent }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.getAdminFirestore }));
vi.mock("@/lib/vapi/verify", () => ({
  verifyVapiWebhook: () => true,
  claimVapiWebhookEvent: async () => "claimed",
}));
vi.mock("@/lib/vapi/businessLookup", () => ({
  findBusinessByVapiAssistantId: async () => "biz_a",
  findBusinessByVapiPhoneNumberId: async () => null,
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
vi.mock("@/lib/ai/deepseekClient", () => ({ classifyCallOutcome: vi.fn() }));
vi.mock("@/lib/ai/agentPromptBuilder", () => ({ buildAgentPrompt: vi.fn() }));

import { POST } from "@/app/api/webhooks/vapi/route";

function toolRequest(name: string, id: string, arguments_: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/webhooks/vapi", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        type: "tool-calls",
        call: {
          id: "provider_call_1",
          assistantId: "assistant_1",
          customer: { number: "+1 (604) 555-1234" },
        },
        toolCalls: [{
          id,
          type: "function",
          function: { name, arguments: arguments_ },
        }],
      },
    }),
  });
}

describe("Vapi appointment audit labels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminFirestore.mockReturnValue({});
    mocks.getBusinessTimezone.mockResolvedValue("America/Los_Angeles");
    mocks.appendAuditEvent.mockResolvedValue(undefined);
  });

  it("records lookup with correlation and Vapi provider IDs, without tool PII", async () => {
    mocks.lookupAppointment.mockResolvedValue("Appointment 1: inspection");

    const response = await POST(toolRequest("lookupAppointment", "tool_lookup_1", {
      callerName: "Guessed Private Name",
      address: "123 Secret Lane",
    }));

    expect(response.status).toBe(200);
    expect(mocks.appendAuditEvent).toHaveBeenCalledOnce();
    const event = mocks.appendAuditEvent.mock.calls[0][1];
    expect(event).toMatchObject({
      businessId: "biz_a",
      correlationId: "call_vapi_provider_call_1",
      action: "appointment.lookup",
      providerIds: {
        vapiCallId: "provider_call_1",
        vapiToolCallId: "tool_lookup_1",
      },
      result: "success",
      details: { outcomeCode: "completed" },
    });
    expect(JSON.stringify(event)).not.toContain("Guessed Private Name");
    expect(JSON.stringify(event)).not.toContain("Secret Lane");
  });

  it("records cancellation as cancellation rather than a lookup or lead action", async () => {
    mocks.cancelAppointment.mockResolvedValue({
      cancelled: true,
      serviceType: "Roof inspection",
      startTime: Date.UTC(2026, 6, 22, 17),
    });

    const response = await POST(toolRequest("cancelAppointment", "tool_cancel_1", {
      confirmCancellation: true,
      appointmentId: "private_appointment_id",
    }));

    expect(response.status).toBe(200);
    expect(mocks.appendAuditEvent).toHaveBeenCalledOnce();
    const event = mocks.appendAuditEvent.mock.calls[0][1];
    expect(event).toMatchObject({
      action: "appointment.cancel",
      providerIds: {
        vapiCallId: "provider_call_1",
        vapiToolCallId: "tool_cancel_1",
      },
      result: "success",
      details: { outcomeCode: "cancelled" },
    });
    expect(JSON.stringify(event)).not.toContain("private_appointment_id");
  });
});
