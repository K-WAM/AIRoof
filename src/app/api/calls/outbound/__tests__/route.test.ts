import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({
  verifyAuthAndRole: vi.fn(),
  verifyOwnBusinessRole: vi.fn(),
  getAdminFirestore: vi.fn(),
  placeElevenLabsOutboundCall: vi.fn(),
  vapiStartOutboundCall: vi.fn(),
}));
vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: mocks.verifyAuthAndRole,
  verifyOwnBusinessRole: mocks.verifyOwnBusinessRole,
}));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.getAdminFirestore }));
vi.mock("@/lib/voice/elevenlabs/outbound", () => ({ placeElevenLabsOutboundCall: mocks.placeElevenLabsOutboundCall }));
vi.mock("@/lib/voice/provider", () => ({
  getVoiceProvider: (config: { voiceProvider?: string }) => config.voiceProvider === "elevenlabs"
    ? { id: "elevenlabs", isConfigured: () => true, startOutboundCall: vi.fn() }
    : { id: "vapi", isConfigured: () => true, startOutboundCall: mocks.vapiStartOutboundCall },
}));
import { POST } from "../route";

const forbidden = () => ({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
const APPT_START = Date.parse("2026-09-28T14:00:00-04:00");

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/calls/outbound", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/calls/outbound", () => {
  let db: FakeDb;
  beforeEach(() => {
    vi.clearAllMocks();
    db = makeFakeDb();
    db.__seed("businesses", "demo-roofing", {
      businessId: "demo-roofing", businessName: "Roofdoctor South Florida", agentName: "Alice", timezone: "America/New_York",
      voiceProvider: "elevenlabs", elevenlabs: { agentId: "agent_1", phoneNumberId: "phone_1" },
    });
    db.__seed("businesses/demo-roofing/appointments", "appt-1", {
      callerName: "Kareem", callerPhone: "+18254887791", serviceType: "Roof inspection",
      address: "317 West Riverbend Drive", startTime: APPT_START, status: "requested",
    });
    mocks.getAdminFirestore.mockReturnValue(db);
    mocks.placeElevenLabsOutboundCall.mockResolvedValue({ callId: "conv_out_1" });
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "admin", superadmin: true } });
    mocks.verifyOwnBusinessRole.mockResolvedValue(forbidden());
  });

  it("lets a superadmin previewing a business call back (it always 403'd before 2026-09-28)", async () => {
    const response = await POST(request({ businessId: "demo-roofing", appointmentId: "appt-1", targetPhone: "+10000000000" }));
    expect(response.status).toBe(200);
    expect(mocks.verifyAuthAndRole).toHaveBeenCalledWith(expect.anything(), "demo-roofing", ["owner", "staff", "superadmin"]);
    expect(mocks.verifyOwnBusinessRole).not.toHaveBeenCalled();
  });

  it("calls the number on the booking and tells the AI which booking it is confirming", async () => {
    await POST(request({ businessId: "demo-roofing", appointmentId: "appt-1", targetPhone: "+10000000000", purpose: "confirm" }));
    const input = mocks.placeElevenLabsOutboundCall.mock.calls[0][0];
    expect(input.businessId).toBe("demo-roofing");
    expect(input.targetPhone).toBe("+18254887791");
    expect(input.firstMessage).toContain("confirm your roof inspection on Monday, September 28 at 2:00 PM");
    expect(input.promptSection).toContain("CONFIRMED");
    expect(input.metadata).toEqual(expect.objectContaining({ businessId: "demo-roofing", appointmentId: "appt-1" }));
  });

  it("records the call under the provider's conversation id", async () => {
    const response = await POST(request({ businessId: "demo-roofing", appointmentId: "appt-1" }));
    expect(await response.json()).toEqual({ callId: "call_elevenlabs_conv_out_1", elevenlabsConversationId: "conv_out_1" });
    expect(db.__peek("businesses/demo-roofing/calls", "call_elevenlabs_conv_out_1")).toEqual(expect.objectContaining({
      callType: "outbound", targetPhone: "+18254887791", appointmentRef: "appt-1", initiatedByUid: "admin",
    }));
  });

  it("keeps a member out of another business", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue(forbidden());
    const response = await POST(request({ businessId: "demo-roofing", appointmentId: "appt-1" }));
    expect(response.status).toBe(403);
    expect(mocks.placeElevenLabsOutboundCall).not.toHaveBeenCalled();
  });

  it("still resolves the business from the session when none is named", async () => {
    mocks.verifyOwnBusinessRole.mockResolvedValue({ user: { uid: "owner-1", businessId: "demo-roofing", role: "owner" } });
    const response = await POST(request({ targetPhone: "+13055550123" }));
    expect(response.status).toBe(200);
    expect(mocks.verifyOwnBusinessRole).toHaveBeenCalled();
    expect(mocks.placeElevenLabsOutboundCall.mock.calls[0][0].targetPhone).toBe("+13055550123");
  });

  it("404s a request id that is not in this business", async () => {
    const response = await POST(request({ businessId: "demo-roofing", appointmentId: "someone-elses" }));
    expect(response.status).toBe(404);
    expect(mocks.placeElevenLabsOutboundCall).not.toHaveBeenCalled();
  });

  it("returns the provider's error and marks the placeholder failed", async () => {
    mocks.placeElevenLabsOutboundCall.mockRejectedValue(new Error("ElevenLabs POST /twilio failed (422)"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(request({ businessId: "demo-roofing", appointmentId: "appt-1" }));
    spy.mockRestore();
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "ElevenLabs POST /twilio failed (422)" });
    const calls = db.__list("businesses/demo-roofing/calls");
    expect(calls).toHaveLength(1);
    expect(calls[0].data.status).toBe("failed");
  });
});
