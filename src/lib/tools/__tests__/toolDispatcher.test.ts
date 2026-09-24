import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bookAppointment: vi.fn(), createLead: vi.fn(), escalateCall: vi.fn(),
  getBusinessTimezone: vi.fn(), logAgentAction: vi.fn(),
}));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: vi.fn(() => null) }));
vi.mock("@/lib/tools/agentTools", () => ({
  ...mocks, checkAvailability: vi.fn(), cancelAppointment: vi.fn(),
  lookupAppointment: vi.fn(), getCurrentDate: vi.fn(),
}));

import { executeAgentTool } from "@/lib/tools/toolDispatcher";

describe("ElevenLabs tool caller identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBusinessTimezone.mockResolvedValue("America/New_York");
    mocks.logAgentAction.mockResolvedValue(undefined);
    mocks.bookAppointment.mockResolvedValue({ appointmentId: "a1", callerName: "Pat", startTime: Date.UTC(2026, 8, 30, 14) });
    mocks.createLead.mockResolvedValue({ callerName: "Pat" });
    mocks.escalateCall.mockResolvedValue({ status: "delivered" });
  });

  const context = { businessId: "biz-stored", callId: "call-stored", provider: "elevenlabs" as const };

  it("never derives a booking or lead phone from model parameters", async () => {
    await executeAgentTool("bookAppointment", { name: "Pat", phone: "+15559990000", callerPhone: "+15559990000", startTime: Date.UTC(2026, 8, 30, 14) }, context);
    await executeAgentTool("createLead", { name: "Pat", phone: "+15559990000", callerPhone: "+15559990000" }, context);
    expect(mocks.bookAppointment).toHaveBeenCalledWith(expect.objectContaining({ businessId: "biz-stored", callerPhone: "" }));
    expect(mocks.createLead).toHaveBeenCalledWith(expect.objectContaining({ businessId: "biz-stored", callerPhone: undefined }));
  });

  it("never derives escalation identity from model parameters", async () => {
    await executeAgentTool("escalateCall", { reason: "Urgent", callerPhone: "+15559990000" }, context);
    expect(mocks.escalateCall).toHaveBeenCalledWith(expect.objectContaining({ businessId: "biz-stored", callerPhone: undefined }));
  });

  it("retains Vapi's existing phone fallback", async () => {
    await executeAgentTool("createLead", { name: "Pat", phone: "+15559990000" }, { ...context, provider: "vapi" });
    expect(mocks.createLead).toHaveBeenCalledWith(expect.objectContaining({ callerPhone: "+15559990000" }));
  });
});
