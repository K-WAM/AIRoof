import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), doc: vi.fn() }));

vi.mock("@/lib/firebase/admin", () => ({
  verifyIdToken: mocks.verify,
  getAdminFirestore: () => ({ collection: () => ({ doc: () => ({ get: mocks.doc }) }) }),
}));

import { GET } from "./route";

function req(): NextRequest {
  return new NextRequest("http://localhost/api/auth/profile", { headers: { cookie: "__session=tok" } });
}

describe("GET /api/auth/profile — superadmin comes from the token claim only", () => {
  beforeEach(() => {
    mocks.verify.mockReset();
    mocks.doc.mockReset();
  });

  it("does not trust a stale superadmin field on a client owner's doc", async () => {
    mocks.verify.mockResolvedValue({ uid: "u1", email: "owner@x.com" });
    mocks.doc.mockResolvedValue({ exists: true, data: () => ({ role: "owner", superadmin: true, businessId: "b1" }) });
    const { profile } = await (await GET(req())).json();
    expect(profile.superadmin).toBe(false);
    expect(profile.role).toBe("owner");
    expect(profile.businessId).toBe("b1");
  });

  it("downgrades a doc-only superadmin role to viewer", async () => {
    mocks.verify.mockResolvedValue({ uid: "u2", email: "x@x.com" });
    mocks.doc.mockResolvedValue({ exists: true, data: () => ({ role: "superadmin", superadmin: true }) });
    const { profile } = await (await GET(req())).json();
    expect(profile.superadmin).toBe(false);
    expect(profile.role).toBe("viewer");
  });

  it("keeps a real (claim-backed) superadmin", async () => {
    mocks.verify.mockResolvedValue({ uid: "u3", email: "connect@luxordev.com", superadmin: true });
    mocks.doc.mockResolvedValue({ exists: true, data: () => ({ role: "superadmin", superadmin: true }) });
    const { profile } = await (await GET(req())).json();
    expect(profile.superadmin).toBe(true);
    expect(profile.role).toBe("superadmin");
  });

  it("401s without a session cookie", async () => {
    const res = await GET(new NextRequest("http://localhost/api/auth/profile"));
    expect(res.status).toBe(401);
  });
});
