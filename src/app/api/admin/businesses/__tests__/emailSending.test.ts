import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({
  verifySuperadmin: vi.fn(),
  getAdminFirestore: vi.fn(),
  getAdminAuth: vi.fn(),
}));

vi.mock("@/lib/auth/verifyRole", () => ({ verifySuperadmin: mocks.verifySuperadmin }));
vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: mocks.getAdminFirestore,
  getAdminAuth: mocks.getAdminAuth,
}));
vi.mock("@/lib/notify", () => ({ sendBusinessWelcomeEmail: vi.fn() }));

import { POST } from "../route";

const validBody = {
  businessId: "email-biz",
  businessName: "Roof Doctors",
  industry: "roofing",
  serviceArea: "Miami",
  businessHours: "Mon-Fri 8-5",
};

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/admin/businesses", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/admin/businesses — customer email details", () => {
  let db: FakeDb;

  beforeEach(() => {
    mocks.verifySuperadmin.mockReset();
    mocks.getAdminFirestore.mockReset();
    mocks.getAdminAuth.mockReset();
    mocks.verifySuperadmin.mockResolvedValue({ user: { uid: "admin-1", email: "connect@luxordev.com" } });
    mocks.getAdminAuth.mockReturnValue(null);
    db = makeFakeDb();
    mocks.getAdminFirestore.mockReturnValue(db);
  });

  it("stores validated email sending details", async () => {
    const response = await POST(request({
      ...validBody,
      emailSending: {
        senderName: "  Roof Doctors  ",
        replyTo: " hello@roofdoctorsfl.com ",
        mode: "own-domain",
        ownDomain: " RoofDoctorsFL.com ",
        dnsHost: "godaddy",
        dnsContactName: " Maria ",
        dnsContactEmail: " maria@roofdoctorsfl.com ",
      },
    }));

    expect(response.status).toBe(200);
    expect(db.__peek("businesses", "email-biz")?.emailSending).toEqual({
      senderName: "Roof Doctors",
      replyTo: "hello@roofdoctorsfl.com",
      mode: "own-domain",
      ownDomain: "roofdoctorsfl.com",
      dnsHost: "godaddy",
      dnsContactName: "Maria",
      dnsContactEmail: "maria@roofdoctorsfl.com",
    });
  });

  it("clears own-domain fields when the Luxor address is chosen", async () => {
    const response = await POST(request({
      ...validBody,
      emailSending: { mode: "luxor", senderName: "Roof Doctors", ownDomain: "roofdoctorsfl.com", dnsHost: "godaddy" },
    }));

    expect(response.status).toBe(200);
    expect(db.__peek("businesses", "email-biz")?.emailSending).toEqual({ mode: "luxor", senderName: "Roof Doctors" });
  });

  it("rejects invalid email sending details and creates nothing", async () => {
    const response = await POST(request({
      ...validBody,
      emailSending: { mode: "own-domain", replyTo: "not-an-email", ownDomain: "https://roofdoctorsfl.com/path" },
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ fieldErrors: { replyTo: expect.any(String), ownDomain: expect.any(String) } });
    expect(db.__peek("businesses", "email-biz")).toBeUndefined();
  });

  it("leaves emailSending out when the request omits it", async () => {
    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
    expect(db.__peek("businesses", "email-biz")).not.toHaveProperty("emailSending");
  });
});
