import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
const mocks = vi.hoisted(() => ({ db: null as unknown, send: vi.fn() }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => mocks.db, getAdminAuth: () => null }));
vi.mock("@/lib/comms/send", () => ({ sendWithLedger: mocks.send }));
import { finishTrialBooking } from "./trialBooking";
const id = "c".repeat(32), businessId = `demo-trial-roofing-${id}`, callId = "call_elevenlabs_conv_private_test";
describe("private-demo confirmation boundaries", () => {
  let db: ReturnType<typeof makeFakeDb>;
  beforeEach(() => {
    db = makeFakeDb(); mocks.db = db; mocks.send.mockReset().mockResolvedValue("delivered");
    db.__seed("demoTrials", id, { businessId, expiresAt: Date.now() + 60000, companyName: "RoofDoctors", email: "entered@example.test", conversationIds: ["conv_private_test"] });
    db.__seed("businesses", businessId, { isDemo: true, isDemoTrial: true, demoTrialExpiresAt: Date.now() + 60000 });
    db.__seed(`businesses/${businessId}/appointments`, "a1", { sourceCallId: callId, callerName: "Caller", callerPhone: "Unknown", callerEmail: "model-wrong@example.test", startTime: Date.now() + 86400000, endTime: Date.now() + 90000000, status: "requested" });
    db.__seed(`businesses/${businessId}/jobs`, "J-1001", { title: "Prepared demo job" });
  });
  it("never auto-confirms normal tenants or an unbound/expired private call", async () => {
    expect(await finishTrialBooking("demo-roofing", callId, "a1")).toBeNull();
    expect(await finishTrialBooking(businessId, "call_elevenlabs_foreign", "a1")).toBeNull();
    db.__seed("demoTrials", id, { businessId, expiresAt: 0, conversationIds: ["conv_private_test"] });
    expect(await finishTrialBooking(businessId, callId, "a1")).toBeNull();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(db.__peek(`businesses/${businessId}/appointments`, "a1")?.status).toBe("requested");
  });
  it("requires the private-demo marker as well as the namespace", async () => {
    db.__seed("businesses", businessId, { isDemo: true, isDemoTrial: false });
    expect(await finishTrialBooking(businessId, callId, "a1")).toBeNull();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("uses only the explicitly entered recipient and links the same booking and job", async () => {
    expect(await finishTrialBooking(businessId, callId, "a1")).toMatchObject({ email: "delivered" });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: "entered@example.test", businessId, entityId: "a1" }));
    const sent = mocks.send.mock.calls[0][0];
    expect(sent.subject).toContain("[Demo]"); expect(sent.html).not.toContain(callId);
    expect(sent.html).toContain("no real service visit");
    expect(db.__peek(`businesses/${businessId}/appointments`, "a1")).toMatchObject({ status: "confirmed", jobId: "J-1001", callerEmail: "entered@example.test" });
    expect(db.__peek(`businesses/${businessId}/jobs`, "J-1001")).toMatchObject({ sourceCallId: callId, sourceAppointmentId: "a1" });
  });
  it("does not send anything when no confirmation email was supplied", async () => {
    const trial = db.__peek("demoTrials", id)!; db.__seed("demoTrials", id, { ...trial, email: null });
    expect(await finishTrialBooking(businessId, callId, "a1")).toMatchObject({ email: "not_requested" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
