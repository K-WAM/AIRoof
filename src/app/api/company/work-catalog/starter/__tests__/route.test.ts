import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";
import { WORK_CATALOG_STARTER } from "@/lib/verticals/workCatalogStarter";

const mocks = vi.hoisted(() => ({
  verifyAuthAndRole: vi.fn(),
}));

vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: mocks.verifyAuthAndRole,
}));

let currentDb: FakeDb;
vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: () => currentDb,
}));

import { POST } from "@/app/api/company/work-catalog/starter/route";

function starterRequest(businessId: unknown) {
  return new NextRequest("http://localhost/api/company/work-catalog/starter", {
    method: "POST",
    body: JSON.stringify({ businessId }),
  });
}

describe("POST /api/company/work-catalog/starter", () => {
  beforeEach(() => {
    mocks.verifyAuthAndRole.mockReset();
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "u1" } });
    currentDb = makeFakeDb();
  });

  it("400s without a businessId, never touching auth or Firestore", async () => {
    const res = await POST(starterRequest(""));
    expect(res.status).toBe(400);
    expect(mocks.verifyAuthAndRole).not.toHaveBeenCalled();
  });

  it("passes through an auth rejection", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    const res = await POST(starterRequest("biz-1"));
    expect(res.status).toBe(403);
  });

  it("409s when the tenant's industry has no starter catalog", async () => {
    currentDb.__seed("businesses", "biz-1", { industry: "unknown-industry" });
    const res = await POST(starterRequest("biz-1"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("No starter catalog for this industry");
  });

  it("403s when the tenant's jobs module is disabled", async () => {
    currentDb.__seed("businesses", "biz-1", { industry: "dental" });
    const res = await POST(starterRequest("biz-1"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Jobs module is disabled for this industry");
  });

  it("imports the tenant's starter catalog (server-picked by industry) with a no-store policy", async () => {
    currentDb.__seed("businesses", "biz-1", { industry: "roofing" });
    const res = await POST(starterRequest("biz-1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    const expected = WORK_CATALOG_STARTER.roofing.length;
    expect(body.added).toBe(expected);
    expect(body.catalog.items).toHaveLength(expected);
    for (const item of body.catalog.items) {
      expect(item.itemId).toMatch(/^starter-roofing-/);
      expect(item.starter).toBe(true);
    }

    const stored = currentDb.__peek("businesses/biz-1/library", "workCatalog");
    expect((stored?.items as unknown[]).length).toBe(expected);
    expect((stored?.starterKitImported as unknown[]).length).toBe(expected);
  });

  it("is idempotent — a second import adds nothing and touches nothing", async () => {
    currentDb.__seed("businesses", "biz-1", { industry: "roofing" });
    await POST(starterRequest("biz-1"));
    const res = await POST(starterRequest("biz-1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.added).toBe(0);
    expect(body.catalog.items).toHaveLength(WORK_CATALOG_STARTER.roofing.length);
  });

  it("never re-adds a starter item the tenant deleted (starterKitImported)", async () => {
    currentDb.__seed("businesses", "biz-1", { industry: "roofing" });
    await POST(starterRequest("biz-1"));

    const stored = currentDb.__peek("businesses/biz-1/library", "workCatalog") as Record<string, unknown>;
    const storedItems = stored.items as Array<{ itemId: string }>;
    const deletedId = storedItems[0].itemId;
    stored.items = storedItems.slice(1);
    await currentDb.collection("businesses/biz-1/library").doc("workCatalog").set(stored);

    const res = await POST(starterRequest("biz-1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.added).toBe(0);
    expect(body.catalog.items.find((i: { itemId: string }) => i.itemId === deletedId)).toBeUndefined();
    expect(body.catalog.items).toHaveLength(WORK_CATALOG_STARTER.roofing.length - 1);
  });
});
