import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

// ZIP rule (owner, 2026-10-30): a field-service phone booking needs the address's ZIP. The tool refuses once, before
// anything is written, so the agent asks — whatever model runs the call. Private demos and appointment industries
// are untouched, and an unreadable business doc books as before.

const mocks = vi.hoisted(() => ({ bookAppointment: vi.fn(), logAgentAction: vi.fn() }));
let db: FakeDb;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/tools/agentTools", () => ({
  bookAppointment: mocks.bookAppointment,
  logAgentAction: mocks.logAgentAction,
  getBusinessTimezone: vi.fn(async () => "America/New_York"),
  createLead: vi.fn(), escalateCall: vi.fn(), checkAvailability: vi.fn(), cancelAppointment: vi.fn(),
  lookupAppointment: vi.fn(), getCurrentDate: vi.fn(), zonedDateTimeToUtc: vi.fn(),
}));
vi.mock("@/lib/comms/sms", () => ({ isSmsEnabled: () => false, sendSms: vi.fn() }));

import { executeAgentTool } from "@/lib/tools/toolDispatcher";

const TRIAL = `demo-trial-roofing-${"a".repeat(32)}`;

beforeEach(() => {
  db = makeFakeDb();
  db.__seed("businesses", "roofer", { businessName: "Roofdoctor", industry: "roofing" });
  db.__seed("businesses", "dentist", { businessName: "Smile", industry: "dental" });
  db.__seed("businesses", TRIAL, { businessName: "Trial", industry: "roofing" });
  mocks.logAgentAction.mockReset().mockResolvedValue(undefined);
  mocks.bookAppointment.mockReset().mockResolvedValue({
    appointmentId: "a1", callerName: "Carla Snyder", callerPhone: "+15555550123",
    startTime: Date.UTC(2026, 10, 2, 15), bookedAfterHours: false, businessTimezone: "America/New_York",
    businessData: { businessName: "Roofdoctor" },
  });
});

const book = (businessId: string, address: string) => executeAgentTool(
  "bookAppointment",
  { callerName: "Carla Snyder", serviceType: "Roof inspection", address, startTime: "2026-11-02T10:00:00" },
  { businessId, callId: "call_zip", callerPhone: "+15555550123", provider: "elevenlabs" },
);

describe("phone booking ZIP rule", () => {
  it("refuses a roofing address with no ZIP and writes nothing", async () => {
    const result = await book("roofer", "120 Palm Way, Boca Raton");
    expect(result.result).toMatch(/^NOT BOOKED: the address has no ZIP code/);
    expect(result.result).toContain("ZIP unknown");
    expect(mocks.bookAppointment).not.toHaveBeenCalled();
  });

  it("books once the ZIP is there, or the caller did not know it", async () => {
    expect((await book("roofer", "120 Palm Way, Boca Raton, FL 33432")).result).toMatch(/^BOOKED|You're booked/);
    expect((await book("roofer", "120 Palm Way, Boca Raton, ZIP unknown")).sayToCaller).toMatch(/^You're booked/);
    expect(mocks.bookAppointment).toHaveBeenCalledTimes(2);
  });

  it("leaves appointment industries and private browser demos alone", async () => {
    expect((await book("dentist", "9 Smile St")).sayToCaller).toMatch(/^You're booked/);
    expect(mocks.bookAppointment).toHaveBeenCalledTimes(1);
    await book(TRIAL, "317 Palm Way, Boca Raton");
    expect(mocks.bookAppointment).toHaveBeenCalledTimes(2);
  });

  it("books as before when the business record cannot be read", async () => {
    expect((await book("missing-business", "120 Palm Way")).sayToCaller).toMatch(/^You're booked/);
    expect(mocks.bookAppointment).toHaveBeenCalledTimes(1);
  });
});
