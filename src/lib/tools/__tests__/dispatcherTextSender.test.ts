import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

// T-169 — the phone AI promises a confirmation text only when one can really go out: from the line this caller dialed,
// with that line's texting Ready. Otherwise the caller hears the email/call sentence and nothing is sent.

const US_DEMO = "+16892042643";
const CA_DEMO = "+17789079769";

const mocks = vi.hoisted(() => ({ bookAppointment: vi.fn(), logAgentAction: vi.fn(), sendSms: vi.fn() }));
let db: FakeDb;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/tools/agentTools", () => ({
  bookAppointment: mocks.bookAppointment,
  logAgentAction: mocks.logAgentAction,
  getBusinessTimezone: vi.fn(async () => "America/New_York"),
  createLead: vi.fn(), escalateCall: vi.fn(), checkAvailability: vi.fn(), cancelAppointment: vi.fn(),
  lookupAppointment: vi.fn(), getCurrentDate: vi.fn(), zonedDateTimeToUtc: vi.fn(),
}));
vi.mock("@/lib/comms/sms", () => ({ isSmsEnabled: () => true, sendSms: mocks.sendSms }));

import { executeAgentTool } from "@/lib/tools/toolDispatcher";

const READY = { status: "ready", purposes: ["booking_received", "appointment_confirmed", "inspector_assigned"], isDefaultSender: false };

beforeEach(() => {
  db = makeFakeDb();
  db.__seed("businessPhoneNumbers", "demo-us", { businessId: "demo-roofing", normalizedPhoneNumber: US_DEMO, status: "live", sms: READY });
  db.__seed("businessPhoneNumbers", "demo-ca", { businessId: "demo-roofing", normalizedPhoneNumber: CA_DEMO, status: "live", sms: { ...READY, status: "pending_registration" } });
  mocks.logAgentAction.mockReset().mockResolvedValue(undefined);
  mocks.sendSms.mockReset().mockResolvedValue("delivered");
  mocks.bookAppointment.mockReset().mockResolvedValue({
    appointmentId: "a1",
    callerName: "Pat Doe",
    callerPhone: "+16045550123", // a Canadian caller…
    startTime: Date.UTC(2026, 9, 5, 14),
    textOk: true,
    bookedAfterHours: false,
    businessTimezone: "America/New_York",
    businessData: { businessName: "Roofdoctor", smsEnabled: true },
  });
});

const call = (calledNumber: string | undefined) => executeAgentTool(
  "bookAppointment",
  { name: "Pat Doe", startTime: Date.UTC(2026, 9, 5, 14), textOk: "yes" },
  { businessId: "demo-roofing", callId: "call-1", callerPhone: "+16045550123", calledNumber, provider: "elevenlabs" },
);

describe("booking-received text follows the dialed line (T-169)", () => {
  it("…who dialed the US line is promised a text, and it goes out from the US line", async () => {
    const result = await call(US_DEMO);
    expect(result.sayToCaller).toContain("by text");
    expect(mocks.bookAppointment).toHaveBeenCalledWith(expect.objectContaining({ calledNumber: US_DEMO }));
    expect(mocks.sendSms).toHaveBeenCalledWith(expect.objectContaining({ calledNumber: US_DEMO, purpose: "booking_received" }));
  });

  it("a line whose texting is not Ready gets no text promise and no text", async () => {
    const result = await call(CA_DEMO);
    expect(result.sayToCaller).not.toMatch(/text/i);
    expect(result.sayToCaller).toContain("call you");
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it("an unknown dialed line gets no text promise", async () => {
    const result = await call("+13055550000");
    expect(result.sayToCaller).not.toMatch(/text/i);
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });
});
