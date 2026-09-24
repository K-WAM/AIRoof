import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetRateLimitState } from "@/lib/auth/rateLimit";

const mocks = vi.hoisted(() => ({
  getAdminFirestore: vi.fn(), findBusinessByVapiAssistantId: vi.fn(),
  findBusinessByVapiPhoneNumberId: vi.fn(), getBusinessTimezone: vi.fn(),
  bookAppointment: vi.fn(), createLead: vi.fn(), escalateCall: vi.fn(),
  checkAvailability: vi.fn(), lookupAppointment: vi.fn(),
  cancelAppointment: vi.fn(), getCurrentDate: vi.fn(), logAgentAction: vi.fn(),
  classifyCallOutcome: vi.fn(),
}));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.getAdminFirestore }));
vi.mock("@/lib/vapi/businessLookup", () => ({
  findBusinessByVapiAssistantId: mocks.findBusinessByVapiAssistantId,
  findBusinessByVapiPhoneNumberId: mocks.findBusinessByVapiPhoneNumberId,
}));
vi.mock("@/lib/tools/agentTools", () => ({
  bookAppointment: mocks.bookAppointment, createLead: mocks.createLead,
  escalateCall: mocks.escalateCall, checkAvailability: mocks.checkAvailability,
  lookupAppointment: mocks.lookupAppointment, cancelAppointment: mocks.cancelAppointment,
  getCurrentDate: mocks.getCurrentDate, logAgentAction: mocks.logAgentAction,
  getBusinessTimezone: mocks.getBusinessTimezone,
}));
vi.mock("@/lib/ai/deepseekClient", () => ({ classifyCallOutcome: mocks.classifyCallOutcome }));
vi.mock("@/lib/ai/agentPromptBuilder", () => ({ buildAgentPrompt: vi.fn() }));
vi.mock("@/lib/vapi/verify", () => ({
  verifyVapiWebhook: () => true,
  claimVapiWebhookEvent: async () => "claimed",
  recordVapiAuthFailure: vi.fn(),
}));

import { POST } from "@/app/api/webhooks/vapi/route";

const call = { id: "vapi-characterization", assistantId: "assistant-1", customer: { number: "+15551234567" } };
function request(message: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/webhooks/vapi", {
    method: "POST", headers: { "content-type": "application/json", "x-vapi-secret": "test-secret" },
    body: JSON.stringify({ message: { ...message, call } }),
  });
}
function toolRequest(name: string, parameters: Record<string, unknown> = {}) {
  return request({ type: "function-call", functionCall: { name, parameters } });
}

describe("Vapi route baseline characterization", () => {
  beforeEach(() => {
    vi.clearAllMocks(); _resetRateLimitState();
    process.env.VAPI_WEBHOOK_SECRET = "test-secret";
    mocks.getAdminFirestore.mockReturnValue({});
    mocks.findBusinessByVapiAssistantId.mockResolvedValue("biz-1");
    mocks.findBusinessByVapiPhoneNumberId.mockResolvedValue(null);
    mocks.getBusinessTimezone.mockResolvedValue("America/New_York");
    mocks.logAgentAction.mockResolvedValue(undefined);
  });

  it("books and returns the baseline confirmation copy", async () => {
    mocks.bookAppointment.mockResolvedValue({ appointmentId: "apt-1", callerName: "Pat", startTime: Date.UTC(2026, 6, 22, 17), pendingConfirmation: false });
    const response = await POST(toolRequest("bookAppointment", { name: "Pat", startTime: Date.UTC(2026, 6, 22, 17) }));
    expect(await response.json()).toEqual({ result: expect.stringContaining("Appointment booked (ID: apt-1) for Pat") });
    expect(mocks.bookAppointment).toHaveBeenCalledWith(expect.objectContaining({ businessId: "biz-1", callerPhone: "+15551234567", sourceCallId: "call_vapi_vapi-characterization" }));
  });

  it("captures a lead", async () => {
    mocks.createLead.mockResolvedValue({ callerName: "Pat" });
    expect(await (await POST(toolRequest("createLead", { name: "Pat" }))).json()).toEqual({ result: "Lead captured for Pat. The team will follow up." });
  });

  it("reports escalation delivery accurately", async () => {
    mocks.escalateCall.mockResolvedValue({ status: "delivered" });
    expect(await (await POST(toolRequest("escalateCall", { reason: "Emergency" }))).json()).toEqual({ result: "I've flagged this as urgent, and the team was notified by email. I can't promise a response time. If anyone is in immediate danger, call emergency services now." });
  });

  it("returns no availability", async () => {
    mocks.checkAvailability.mockResolvedValue({ available: false, suggestedSlots: [] });
    expect(await (await POST(toolRequest("checkAvailability"))).json()).toEqual({ result: "No openings in the next few days. I can take a message and have someone reach out." });
  });

  it("looks up using caller metadata", async () => {
    mocks.lookupAppointment.mockResolvedValue("Safe appointment summary");
    expect(await (await POST(toolRequest("lookupAppointment", { callerPhone: "+15550000000" }))).json()).toEqual({ result: "Safe appointment summary" });
    expect(mocks.lookupAppointment).toHaveBeenCalledWith({ businessId: "biz-1", callId: "call_vapi_vapi-characterization", verifiedCallerPhone: "+15551234567" });
  });

  it("cancels using verified caller metadata", async () => {
    mocks.cancelAppointment.mockResolvedValue({ serviceType: "Inspection", startTime: Date.UTC(2026, 6, 22, 17) });
    const body = await (await POST(toolRequest("cancelAppointment", { confirm: true, appointmentId: "apt-1" }))).json();
    expect(body.result).toContain("Your Inspection appointment on");
    expect(body.result).toContain("has been cancelled.");
    expect(mocks.cancelAppointment).toHaveBeenCalledWith(expect.objectContaining({ businessId: "biz-1", verifiedCallerPhone: "+15551234567", confirmCancellation: true, appointmentId: "apt-1" }));
  });

  it("returns the business date", async () => {
    mocks.getCurrentDate.mockResolvedValue({ today: "July 22, 2026", dayOfWeek: "Wednesday", isoDate: "2026-07-22" });
    expect(await (await POST(toolRequest("getCurrentDate"))).json()).toEqual({ result: 'Today is July 22, 2026 (Wednesday). ISO: 2026-07-22. Use this when calculating relative dates like "next Wednesday" or "this Friday".' });
  });

  it("writes the baseline end-of-call document and outcome", async () => {
    const set = vi.fn();
    const callRef = { set };
    const businessRef = { collection: vi.fn(() => ({ doc: vi.fn(() => callRef) })), get: vi.fn(async () => ({ data: () => ({ businessName: "Tenant" }) })) };
    mocks.getAdminFirestore.mockReturnValue({ collection: () => ({ doc: () => businessRef }) });
    mocks.classifyCallOutcome.mockResolvedValue({ outcome: "booked", reason: "Appointment made" });
    const response = await POST(request({ type: "end-of-call-report", summary: "Summary", endedReason: "customer-ended-call", messages: [{ role: "user", message: "Hello", time: 1000 }, { role: "bot", message: "Hi", time: 2000 }] }));
    expect(response.status).toBe(200);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      callId: "call_vapi_vapi-characterization", businessId: "biz-1", callerPhone: "+15551234567", status: "ended", vapiCallId: "vapi-characterization", summary: "Summary", endedReason: "customer-ended-call", recordingUrl: null, cost: null, outcome: "booked", outcomeReason: "Appointment made", messages: [{ messageId: "m_0", role: "caller", text: "Hello", timestamp: 1000 }, { messageId: "m_1", role: "agent", text: "Hi", timestamp: 2000 }],
    }), { merge: true });
  });
});
