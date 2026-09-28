import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetRateLimitState } from "@/lib/auth/rateLimit";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({
  verifySuperadmin: vi.fn(), getAdminFirestore: vi.fn(), startOutboundCall: vi.fn(), isConfigured: vi.fn(),
  placeElevenLabsOutboundCall: vi.fn(),
}));
vi.mock("@/lib/auth/verifyRole", () => ({ verifySuperadmin: mocks.verifySuperadmin }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.getAdminFirestore }));
vi.mock("@/lib/voice/provider", () => ({ getVoiceProvider: () => ({
  id: "elevenlabs", isConfigured: mocks.isConfigured, startOutboundCall: mocks.startOutboundCall,
}) }));
vi.mock("@/lib/voice/elevenlabs/outbound", () => ({ placeElevenLabsOutboundCall: mocks.placeElevenLabsOutboundCall }));
import { POST } from "../route";

function request(phone = "+13055550123") {
  return new NextRequest("http://localhost/api/admin/demo-customize/test-call", {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.8" },
    body: JSON.stringify({ phone }),
  });
}

describe("POST /api/admin/demo-customize/test-call", () => {
  beforeEach(() => {
    vi.clearAllMocks(); _resetRateLimitState();
    mocks.verifySuperadmin.mockResolvedValue({ user: { uid: "superadmin" } });
    mocks.isConfigured.mockReturnValue(true);
    mocks.placeElevenLabsOutboundCall.mockResolvedValue({ callId: "conv-test" });
    const db = makeFakeDb();
    db.__seed("businesses", "demo-roofing", {
      businessId: "demo-roofing", businessName: "Test Roofing", industry: "roofing", serviceArea: "Miami",
      businessHours: "Mon-Fri 8-5", emergencyRules: [], bookingRules: [], approvedServices: [], approvedFaqs: [],
      disallowedTopics: [], active: true, voiceProvider: "elevenlabs",
      elevenlabs: { agentId: "agent", phoneNumberId: "phone" }, greeting: "Thanks for calling Test Roofing.",
    });
    mocks.getAdminFirestore.mockReturnValue(db);
  });

  it("is superadmin-only", async () => {
    mocks.verifySuperadmin.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.placeElevenLabsOutboundCall).not.toHaveBeenCalled();
  });

  it("starts an ElevenLabs call from the demo tenant with the tenant's full inbound setup", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, callId: "conv-test" });
    expect(mocks.placeElevenLabsOutboundCall).toHaveBeenCalledWith(expect.objectContaining({
      businessId: "demo-roofing",
      targetPhone: "+13055550123",
      config: expect.objectContaining({ businessName: "Test Roofing" }),
      metadata: { businessId: "demo-roofing", source: "demo-studio-test-call" },
    }));
    // No opener override: the tenant's own greeting (with the recording notice) is used.
    expect(mocks.placeElevenLabsOutboundCall.mock.calls[0][0].firstMessage).toBeUndefined();
  });

  it("limits one IP to three calls per ten minutes", async () => {
    for (let i = 0; i < 3; i += 1) expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(429);
  });
});
