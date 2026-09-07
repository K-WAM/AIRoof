import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// GET was unauthenticated until this fix — a business's pricing catalog is
// exactly the kind of tenant data that shouldn't be world-readable. Mock
// Firestore to throw if reached, so a regression that skips the auth gate
// fails loudly instead of silently returning real (or fake empty) data.
vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: () => {
    throw new Error("getAdminFirestore should not be called before the auth gate resolves");
  },
}));

import { GET } from "../route";

function requestWithoutSession(businessId: string): NextRequest {
  return new NextRequest(`http://localhost/api/company/library?businessId=${businessId}`);
}

describe("GET /api/company/library", () => {
  it("requires businessId", async () => {
    const req = new NextRequest("http://localhost/api/company/library");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("401s with no session cookie, never touching Firestore", async () => {
    const res = await GET(requestWithoutSession("demo-roofing"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthenticated");
  });
});
