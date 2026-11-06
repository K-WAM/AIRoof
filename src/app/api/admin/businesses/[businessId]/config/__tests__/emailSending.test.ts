import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ verifySuperadmin: vi.fn(), getAdminFirestore: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifySuperadmin: mocks.verifySuperadmin }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.getAdminFirestore }));

import { PUT } from "../route";

const params = { params: Promise.resolve({ businessId: "biz-1" }) };

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/admin/businesses/biz-1/config", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

describe("PUT /api/admin/businesses/[businessId]/config — customer email details", () => {
  let db: FakeDb;

  beforeEach(() => {
    mocks.verifySuperadmin.mockReset();
    mocks.getAdminFirestore.mockReset();
    mocks.verifySuperadmin.mockResolvedValue({ user: { uid: "superadmin" } });
    db = makeFakeDb();
    db.__seed("businesses", "biz-1", { businessName: "Example Roofing", industry: "roofing" });
    mocks.getAdminFirestore.mockReturnValue(db);
  });

  it("stores the validated details and leaves other config alone", async () => {
    const response = await PUT(request({
      businessName: "Example Roofing",
      emailSending: {
        senderName: " Example Roofing ",
        replyTo: " hello@yourcompany.com ",
        mode: "own-domain",
        ownDomain: " YourCompany.com ",
        dnsHost: "cloudflare",
        dnsHostOther: "",
        notes: " Call first ",
      },
    }), params);

    expect(response.status).toBe(200);
    expect(db.__peek("businesses", "biz-1")).toMatchObject({
      businessName: "Example Roofing",
      industry: "roofing",
      emailSending: {
        senderName: "Example Roofing",
        replyTo: "hello@yourcompany.com",
        mode: "own-domain",
        ownDomain: "yourcompany.com",
        dnsHost: "cloudflare",
        notes: "Call first",
      },
    });
  });

  it("rejects invalid details with 400 before touching the database", async () => {
    const response = await PUT(request({ emailSending: { mode: "own-domain", ownDomain: "yourcompany.com/path" } }), params);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ fieldErrors: { ownDomain: expect.any(String) } });
    expect(mocks.getAdminFirestore).not.toHaveBeenCalled();
    expect(db.__peek("businesses", "biz-1")).not.toHaveProperty("emailSending");
  });

  it("never wipes stored details when the body omits emailSending", async () => {
    const stored = { senderName: "Example Roofing", mode: "own-domain", ownDomain: "yourcompany.com", dnsHost: "other", dnsHostOther: "Our IT person" };
    db.__seed("businesses", "biz-1", { businessName: "Example Roofing", industry: "roofing", emailSending: stored });

    const response = await PUT(request({ businessName: "Example Roofing FL" }), params);

    expect(response.status).toBe(200);
    expect(db.__peek("businesses", "biz-1")).toMatchObject({ businessName: "Example Roofing FL", emailSending: stored });
  });

  it("clears own-domain fields when the client switches to a Luxor address", async () => {
    db.__seed("businesses", "biz-1", {
      businessName: "Example Roofing",
      industry: "roofing",
      emailSending: { mode: "own-domain", ownDomain: "yourcompany.com", dnsHost: "godaddy" },
    });

    const response = await PUT(request({ emailSending: { mode: "luxor", senderName: "Example Roofing" } }), params);

    expect(response.status).toBe(200);
    expect(db.__peek("businesses", "biz-1")?.emailSending).toEqual({ mode: "luxor", senderName: "Example Roofing" });
  });
});
