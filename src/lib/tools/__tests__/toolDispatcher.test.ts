import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bookAppointment: vi.fn(), createLead: vi.fn(), escalateCall: vi.fn(),
  checkAvailability: vi.fn(), cancelAppointment: vi.fn(), lookupAppointment: vi.fn(),
  getBusinessTimezone: vi.fn(), logAgentAction: vi.fn(), zonedDateTimeToUtc: vi.fn(),
}));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: vi.fn(() => null) }));
vi.mock("@/lib/tools/agentTools", () => ({
  ...mocks, getCurrentDate: vi.fn(),
}));

import { executeAgentTool } from "@/lib/tools/toolDispatcher";

describe("ElevenLabs tool caller identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBusinessTimezone.mockResolvedValue("America/New_York");
    mocks.logAgentAction.mockResolvedValue(undefined);
    mocks.zonedDateTimeToUtc.mockImplementation((parts: { year: number; month: number; day: number; hour: number; minute: number }) =>
      Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour + (parts.month >= 11 ? 5 : 4), parts.minute)
    );
    mocks.bookAppointment.mockResolvedValue({ appointmentId: "a1", callerName: "Pat", startTime: Date.UTC(2026, 8, 30, 14), businessTimezone: "America/New_York" });
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

  it("returns spoken appointment copy without reading timezone twice for numeric booking times", async () => {
    const result = await executeAgentTool("bookAppointment", {
      name: "Pat", startTime: Date.UTC(2026, 8, 30, 14),
    }, { ...context, callerPhone: "+15551234567" });
    expect(result.sayToCaller).toMatch(/^You're booked for/);
    expect(result.sayToCaller).not.toContain("a1");
    expect(result.result).toContain("a1");
    expect(mocks.getBusinessTimezone).not.toHaveBeenCalled();
  });

  it("adds safe spoken copy to lookup and cancellation results", async () => {
    mocks.lookupAppointment.mockResolvedValue("Appointment 1: inspection on Tuesday. Ask the caller to confirm cancellation.");
    mocks.cancelAppointment.mockResolvedValue({ serviceType: "Inspection", startTime: Date.UTC(2026, 8, 30, 14) });
    const caller = { ...context, callerPhone: "+15551234567" };
    const lookup = await executeAgentTool("lookupAppointment", {}, caller);
    const cancel = await executeAgentTool("cancelAppointment", { confirmCancellation: true }, caller);
    expect(lookup.sayToCaller).toBe("Appointment 1: inspection on Tuesday.");
    expect(cancel.sayToCaller).toContain("has been cancelled");
  });

  it("returns closest openings with a booking conflict instead of making the caller guess", async () => {
    const conflict = Object.assign(new Error("That requested time was just taken."), { code: "slot_conflict" });
    mocks.bookAppointment.mockRejectedValue(conflict);
    mocks.checkAvailability.mockResolvedValue({
      available: true,
      suggestedSlots: [
        { startTime: "2026-09-28T13:00:00.000Z", endTime: "2026-09-28T14:00:00.000Z" },
        { startTime: "2026-09-28T13:30:00.000Z", endTime: "2026-09-28T14:30:00.000Z" },
        { startTime: "2026-09-28T14:00:00.000Z", endTime: "2026-09-28T15:00:00.000Z" },
      ],
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await executeAgentTool("bookAppointment", {
      name: "Pat", startTime: "2026-09-28T08:00", serviceType: "Inspection",
    }, { ...context, callerPhone: "+15551234567" });

    expect(result).toEqual({
      result: "NOT BOOKED: 8:00 AM Monday was just taken. Nothing was booked for this caller. Offer them the closest openings: 9:00 AM, 9:30 AM or 10:00 AM.",
      sayToCaller: "Sorry, 8:00 AM Monday was just taken. The closest openings are 9:00 AM, 9:30 AM or 10:00 AM. Which works best for you?",
    });
    // The live agent read "8 AM Monday is booked" as success (agent test, 2026-09-27): the caller-facing sentence
    // must never contain "booked", and the model-facing one only as "NOT BOOKED".
    expect(result.sayToCaller).not.toMatch(/booked/i);
    expect(result.result?.replace("NOT BOOKED", "")).not.toMatch(/\bis booked\b/i);
    expect(mocks.checkAvailability).toHaveBeenCalledWith(expect.objectContaining({
      businessId: "biz-stored", preferredDate: "2026-09-28", preferredTime: "8:00 AM",
    }));
  });

  it("converts a bare future local date with that date's DST offset", async () => {
    await executeAgentTool("bookAppointment", {
      name: "Pat", startTime: "2026-11-03T09:00",
    }, { ...context, callerPhone: "+15551234567" });
    expect(mocks.zonedDateTimeToUtc).toHaveBeenCalledWith({
      year: 2026, month: 11, day: 3, hour: 9, minute: 0, second: 0,
    }, "America/New_York");
    expect(mocks.bookAppointment).toHaveBeenCalledWith(expect.objectContaining({
      startTime: Date.parse("2026-11-03T14:00:00.000Z"),
    }));
  });

  it("captures a lead when hours are not set up and never says no openings", async () => {
    mocks.checkAvailability.mockResolvedValue({
      available: false, suggestedSlots: [], hoursStatus: "missing_or_invalid",
    });
    const result = await executeAgentTool("checkAvailability", {
      name: "Pat", serviceType: "Inspection", preferredDate: "2026-09-28",
    }, { ...context, callerPhone: "+15551234567" });
    expect(mocks.createLead).toHaveBeenCalledWith(expect.objectContaining({
      businessId: "biz-stored", callerName: "Pat", callerPhone: "+15551234567", serviceRequested: "Inspection",
    }));
    expect(result.result).toContain("hours are not set up");
    expect(result.result).not.toContain("No openings");
  });
});
