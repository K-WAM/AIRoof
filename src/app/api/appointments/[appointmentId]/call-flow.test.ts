import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  firestore: vi.fn(),
  send: vi.fn(),
  runLedgeredEmail: vi.fn(async () => "delivered" as const),
  notifyInspector: vi.fn(async () => ({ emailed: 1, texted: 0 })),
  isSmsEnabled: vi.fn(() => false),
  sendSms: vi.fn(async () => "delivered" as const),
}));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: mocks.verify }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.firestore }));
vi.mock("@/lib/comms/send", () => ({ sendEmail: mocks.send, sendWithLedger: vi.fn(), isCommsConfigured: () => false }));
vi.mock("@/lib/crews/inspectorNotify", () => ({ notifyInspector: mocks.notifyInspector }));
vi.mock("@/lib/comms/sms", () => ({ isSmsEnabled: mocks.isSmsEnabled, sendSms: mocks.sendSms }));
vi.mock("@/lib/tools/agentTools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tools/agentTools")>();
  return { ...actual, runLedgeredEmail: mocks.runLedgeredEmail };
});
import { PATCH } from "./route";

const HOURS = { Monday: "8:00 AM - 5:00 PM", Tuesday: "8:00 AM - 5:00 PM", Wednesday: "8:00 AM - 5:00 PM", Thursday: "8:00 AM - 5:00 PM", Friday: "8:00 AM - 5:00 PM", Saturday: "Closed", Sunday: "Closed" };
const START = Date.parse("2026-10-05T14:00:00Z"); // Mon 10:00 AM ET
const END = START + 3_600_000;

let db = makeFakeDb();
const context = { params: Promise.resolve({ appointmentId: "appt" }) };
const requestFor = (body: Record<string, unknown>) =>
  new NextRequest("http://localhost/api/appointments/appt", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

function seedAppointment(overrides: Record<string, unknown> = {}) {
  db.__seed("businesses/biz/appointments", "appt", {
    appointmentId: "appt", startTime: START, endTime: END, status: "requested",
    callerName: "Carla", callerPhone: "+13055550111", callerEmail: "carla@example.com",
    address: "12 Palm Ave", serviceType: "Roof inspection", textOk: true, ...overrides,
  });
}

beforeEach(() => {
  db = makeFakeDb();
  db.__seed("businesses", "biz", {
    businessName: "Apex Roofing", timezone: "America/New_York", businessHours: HOURS,
    contactPhone: "(305) 555-0111", contactEmail: "hello@apex.test", smsEnabled: true,
  });
  db.__seed("businesses/biz/crews", "c1", { name: "Dominic", kind: "inspector", email: "dom@apex.test", phone: "+13055550111", active: true });
  db.__seed("businesses/biz/crews", "c2", { name: "Tyler Crew", active: true });
  seedAppointment();
  mocks.firestore.mockReset().mockReturnValue(db);
  mocks.verify.mockReset().mockResolvedValue({ user: { uid: "staff-1", role: "staff" } });
  mocks.send.mockReset().mockResolvedValue({ status: "delivered" });
  mocks.runLedgeredEmail.mockReset().mockResolvedValue("delivered");
  mocks.notifyInspector.mockReset().mockResolvedValue({ emailed: 1, texted: 0 });
  mocks.isSmsEnabled.mockReset().mockReturnValue(false);
  mocks.sendSms.mockReset().mockResolvedValue("delivered");
});

describe("PATCH /api/appointments — inspector assignment notifications (T-152)", () => {
  it("assigns and notifies the new inspector row", async () => {
    const response = await PATCH(requestFor({ businessId: "biz", assignedCrewId: "c1" }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, staffNotified: 1 });
    expect(db.__peek("businesses/biz/appointments", "appt")?.assignedBy).toBe("office");
    expect(mocks.notifyInspector).toHaveBeenCalledWith(expect.objectContaining({ change: "assigned", crewId: "c1" }));
  });

  it("409s when the inspector has a time block then, with the block label", async () => {
    db.__seed("businesses/biz/timeBlocks", "blk1", { crewId: "c1", startTime: START, endTime: END, label: "Site visit" });
    const response = await PATCH(requestFor({ businessId: "biz", assignedCrewId: "c1" }), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "inspector_busy", message: "Dominic is busy then (Site visit)." });
    expect(mocks.notifyInspector).not.toHaveBeenCalled();
  });

  it("force assigns anyway past a block", async () => {
    db.__seed("businesses/biz/timeBlocks", "blk1", { crewId: "c1", startTime: START, endTime: END, label: "Site visit" });
    const response = await PATCH(requestFor({ businessId: "biz", assignedCrewId: "c1", force: true }), context);
    expect(response.status).toBe(200);
    expect(db.__peek("businesses/biz/appointments", "appt")?.assignedCrewId).toBe("c1");
  });

  it("409s on another active inspection of that row and force overrides it", async () => {
    db.__seed("businesses/biz/appointments", "appt2", { appointmentId: "appt2", startTime: START + 1_800_000, endTime: END + 1_800_000, status: "requested", assignedCrewId: "c1" });
    const blocked = await PATCH(requestFor({ businessId: "biz", assignedCrewId: "c1" }), context);
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ code: "inspector_busy", message: "Dominic is busy then (another inspection)." });
    const forced = await PATCH(requestFor({ businessId: "biz", assignedCrewId: "c1", force: true }), context);
    expect(forced.status).toBe(200);
  });

  it("notifies moved when only the time changes on an inspector row", async () => {
    seedAppointment({ assignedCrewId: "c1", assignedBy: "ai" });
    const response = await PATCH(requestFor({ businessId: "biz", startTime: START + 7_200_000 }), context);
    expect(response.status).toBe(200);
    expect(mocks.notifyInspector).toHaveBeenCalledWith(expect.objectContaining({ change: "moved", crewId: "c1" }));
    expect(db.__peek("businesses/biz/appointments", "appt")?.assignedBy).toBe("ai");
  });

  it("notifies reassigned_away for the old row and assigned for the new one", async () => {
    seedAppointment({ assignedCrewId: "c1" });
    const response = await PATCH(requestFor({ businessId: "biz", assignedCrewId: "c2" }), context);
    expect(response.status).toBe(200);
    expect(mocks.notifyInspector).toHaveBeenCalledWith(expect.objectContaining({ change: "reassigned_away", crewId: "c1" }));
    expect(mocks.notifyInspector).toHaveBeenCalledWith(expect.objectContaining({ change: "assigned", crewId: "c2" }));
  });

  it("notifies cancelled when a booked appointment is declined", async () => {
    seedAppointment({ assignedCrewId: "c1" });
    const response = await PATCH(requestFor({ businessId: "biz", declineReason: "Fully booked" }), context);
    expect(await response.json()).toMatchObject({ ok: true, staffNotified: 1 });
    expect(mocks.notifyInspector).toHaveBeenCalledWith(expect.objectContaining({ change: "cancelled", crewId: "c1" }));
  });
});

describe("PATCH /api/appointments — customer notifyChannel (T-152, owner rule 2026-09-28)", () => {
  it("emails AND texts when the caller gave an email and said OK to text", async () => {
    mocks.isSmsEnabled.mockReturnValue(true);
    const response = await PATCH(requestFor({ businessId: "biz", assignedCrewId: "c2", notifyCustomer: true, notifyChannel: "auto" }), context);
    expect(await response.json()).toMatchObject({ notifiedChannels: ["sms", "email"], notifiedCustomer: true });
    expect(mocks.sendSms).toHaveBeenCalledOnce();
    expect(mocks.runLedgeredEmail).toHaveBeenCalledOnce();
  });

  it("an explicit single channel still sends only that one", async () => {
    mocks.isSmsEnabled.mockReturnValue(true);
    const response = await PATCH(requestFor({ businessId: "biz", assignedCrewId: "c2", notifyCustomer: true, notifyChannel: "sms" }), context);
    expect(await response.json()).toMatchObject({ notifiedChannels: ["sms"], notifiedVia: "sms" });
    expect(mocks.runLedgeredEmail).not.toHaveBeenCalled();
  });

  it("falls back to email when texting is off", async () => {
    const response = await PATCH(requestFor({ businessId: "biz", assignedCrewId: "c2", notifyCustomer: true }), context);
    expect(await response.json()).toMatchObject({ notifiedVia: "email" });
    expect(mocks.runLedgeredEmail).toHaveBeenCalledOnce();
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it("honours textOk: false and an explicit channel", async () => {
    mocks.isSmsEnabled.mockReturnValue(true);
    seedAppointment({ textOk: false });
    const auto = await PATCH(requestFor({ businessId: "biz", assignedCrewId: "c2", notifyCustomer: true }), context);
    expect(await auto.json()).toMatchObject({ notifiedVia: "email" });

    mocks.isSmsEnabled.mockReturnValue(false);
    const explicit = await PATCH(requestFor({ businessId: "biz", assignedCrewId: "c2", notifyCustomer: true, notifyChannel: "none" }), context);
    expect(await explicit.json()).toMatchObject({ notifiedVia: null, notifiedCustomer: false });
  });

  it("reports no channel when there is neither phone nor email", async () => {
    seedAppointment({ callerPhone: undefined, callerEmail: undefined });
    const response = await PATCH(requestFor({ businessId: "biz", assignedCrewId: "c2", notifyCustomer: true }), context);
    expect(await response.json()).toMatchObject({ notifiedVia: null });
  });

  it("rejects an unknown notifyChannel", async () => {
    const response = await PATCH(requestFor({ businessId: "biz", notifyChannel: "fax" }), context);
    expect(response.status).toBe(400);
  });
});
