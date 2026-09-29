import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

// T-171 — onboarding a client can never take the shared demo lines or another business's number, and nothing (not even
// the owner's login) is created when it tries.

const mocks = vi.hoisted(() => ({ verifySuperadmin: vi.fn(), createUser: vi.fn(), sendWelcome: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifySuperadmin: mocks.verifySuperadmin }));
vi.mock("@/lib/notify", () => ({ sendBusinessWelcomeEmail: mocks.sendWelcome }));
let db: FakeDb;
vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: () => db,
  getAdminAuth: () => ({ createUser: mocks.createUser, generatePasswordResetLink: vi.fn(async () => "https://reset") }),
}));

const body = (phoneNumber?: string, extra: Record<string, unknown> = {}) => ({
  businessId: "newco",
  businessName: "NewCo Roofing",
  industry: "roofing",
  serviceArea: "Miami",
  businessHours: "Mon-Fri 8-5",
  ownerEmail: "owner@newco.test",
  ...(phoneNumber ? { phoneNumber } : {}),
  ...extra,
});

async function post(payload: Record<string, unknown>) {
  const { POST } = await import("@/app/api/admin/businesses/route");
  return POST(new NextRequest("http://localhost/api/admin/businesses", { method: "POST", body: JSON.stringify(payload) }));
}

beforeEach(() => {
  vi.resetModules();
  db = makeFakeDb();
  db.__seed("businesses", "demo-roofing", { isDemo: true, elevenlabs: { agentId: "d", phoneNumber: "+16892042643", extraPhoneNumbers: ["+17789079769"] } });
  db.__seed("businesses", "acme", { elevenlabs: { agentId: "a", phoneNumber: "+13055550100" } });
  mocks.verifySuperadmin.mockReset().mockResolvedValue({ user: { uid: "admin-1", email: "connect@luxordev.com", superadmin: true } });
  mocks.createUser.mockReset().mockResolvedValue({ uid: "owner-uid" });
  mocks.sendWelcome.mockReset().mockResolvedValue({ status: "delivered" });
});

describe("POST /api/admin/businesses — the main phone (T-171)", () => {
  it.each([["US demo", "(689) 204-2643"], ["Canada demo", "+1 778 907 9769"], ["another client", "305-555-0100"]])(
    "refuses the %s number before creating anything",
    async (_name, phone) => {
      const res = await post(body(phone));
      expect(res.status).toBe(409);
      expect((await res.json()).fieldErrors?.phoneNumber).toBeTruthy();
      expect(mocks.createUser).not.toHaveBeenCalled();
      expect(db.__peek("businesses", "newco")).toBeUndefined();
      expect(db.__list("businessPhoneNumbers")).toEqual([]);
    },
  );

  it("refuses a malformed number", async () => {
    const res = await post(body("555-0100"));
    expect(res.status).toBe(400);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("creates the client with its line as a Draft that routes nothing yet", async () => {
    const res = await post(body("(305) 555-0123", { lineAcquisition: "forward" }));
    expect(res.status).toBe(200);
    expect(db.__peek("businessPhoneNumbers", "newco-main")).toMatchObject({
      businessId: "newco",
      normalizedPhoneNumber: "+13055550123",
      status: "draft",
      purpose: "client",
      acquisition: "forward",
      active: false,
      sms: { status: "not_configured" },
    });
    expect(db.__peek("businesses", "newco")?.elevenlabs).toBeUndefined();
    expect(db.__peek("businesses", "demo-roofing")?.elevenlabs).toEqual({ agentId: "d", phoneNumber: "+16892042643", extraPhoneNumbers: ["+17789079769"] });
  });
});
