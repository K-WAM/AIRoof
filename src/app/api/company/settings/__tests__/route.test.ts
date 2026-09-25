import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyAuthAndRole: vi.fn(),
}));

vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: mocks.verifyAuthAndRole,
}));

let currentDoc: Record<string, unknown> | undefined;
vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: currentDoc !== undefined, data: () => currentDoc }),
        update: vi.fn(),
      }),
    }),
  }),
}));

import { GET } from "@/app/api/company/settings/route";

function requestFor(businessId: string | null) {
  const url = businessId
    ? `http://localhost/api/company/settings?businessId=${businessId}`
    : "http://localhost/api/company/settings";
  return new NextRequest(url);
}

describe("GET /api/company/settings", () => {
  beforeEach(() => {
    mocks.verifyAuthAndRole.mockReset();
    currentDoc = { businessName: "Apex Roofing", timezone: "America/New_York" };
  });

  // This GET previously had NO auth check at all — any caller who knew a
  // businessId could read another tenant's notification email/contact info.
  it("requires authentication — refuses when verifyAuthAndRole rejects", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    });

    const response = await GET(requestFor("biz-1"));
    expect(response.status).toBe(401);
    expect(mocks.verifyAuthAndRole).toHaveBeenCalledWith(expect.anything(), "biz-1", [
      "owner", "staff", "viewer", "superadmin",
    ]);
  });

  it("returns settings once authorized", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "u1", superadmin: false } });
    const response = await GET(requestFor("biz-1"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ businessName: "Apex Roofing" });
  });

  it("returns the public document letterhead fields", async () => {
    currentDoc = { ...currentDoc, address: "1 Main St", websiteUrl: "https://example.test", brandColor: "#008080", logoUrl: "legacy", licenseNumber: "LIC-42" };
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "u1" } });
    const response = await GET(requestFor("biz-1"));
    expect(await response.json()).toMatchObject({ address: "1 Main St", websiteUrl: "https://example.test", brandColor: "#008080", logoUrl: "legacy", licenseNumber: "LIC-42" });
  });

  it("400s without checking auth when businessId is missing", async () => {
    const response = await GET(requestFor(null));
    expect(response.status).toBe(400);
    expect(mocks.verifyAuthAndRole).not.toHaveBeenCalled();
  });
});
