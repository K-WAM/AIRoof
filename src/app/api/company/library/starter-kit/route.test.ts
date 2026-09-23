import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ verifyAuthAndRole: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: mocks.verifyAuthAndRole }));
let currentDb: FakeDb;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => currentDb }));

import { POST } from "./route";

const request = (businessId = "biz-1") => new NextRequest("http://localhost/api/company/library/starter-kit", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId }),
});
const collection = "businesses/biz-1/library";

describe("POST /api/company/library/starter-kit", () => {
  beforeEach(() => {
    currentDb = makeFakeDb();
    currentDb.__seed("businesses", "biz-1", { industry: "roofing" });
    mocks.verifyAuthAndRole.mockReset();
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "owner" } });
  });

  it("rejects unauthenticated and unauthorized calls before any write", async () => {
    mocks.verifyAuthAndRole.mockResolvedValueOnce({ error: new Response("Unauthorized", { status: 401 }) });
    expect((await POST(request())).status).toBe(401);
    expect(currentDb.__peek(collection, "pricing")).toBeUndefined();
    mocks.verifyAuthAndRole.mockResolvedValueOnce({ error: new Response("Forbidden", { status: 403 }) });
    expect((await POST(request())).status).toBe(403);
    expect(currentDb.__peek(collection, "pricing")).toBeUndefined();
    expect(mocks.verifyAuthAndRole).toHaveBeenCalledWith(expect.any(NextRequest), "biz-1", ["owner", "staff", "superadmin"]);
  });

  it("loads once, then preserves tenant edits on a second load", async () => {
    const first = await POST(request());
    expect(first.status).toBe(200);
    expect(first.headers.get("Cache-Control")).toBe("no-store");
    expect((await first.json()).added).toBeGreaterThan(0);
    const saved = currentDb.__peek(collection, "pricing")!;
    const materials = saved.materials as Array<{ name: string; unitPrice: number }>;
    materials[0].unitPrice = 812;
    const documents = saved.documents as Array<{ docId: string; name: string }>;
    documents[0].name = "My revised agreement";
    currentDb.__seed(collection, "pricing", { ...saved, materials, documents });

    const second = await POST(request());
    const result = await second.json();
    expect(result.added).toBe(0);
    expect(result.library.materials[0].unitPrice).toBe(812);
    expect(result.library.documents[0].name).toBe("My revised agreement");
    expect(result.library.documents).toHaveLength(documents.length);
  });

  it("does not import pricing for a pricing-disabled industry", async () => {
    currentDb.__seed("businesses", "biz-1", { industry: "dental" });
    const response = await POST(request());
    const result = await response.json();
    expect(result.library.materials).toEqual([]);
    expect(result.library.laborRates).toEqual([]);
    expect(result.library.documents).toHaveLength(2);
  });

  it("refuses blank or unrecognized industries without a fallback kit", async () => {
    currentDb.__seed("businesses", "biz-1", { industry: "" });
    expect((await POST(request())).status).toBe(409);
    currentDb.__seed("businesses", "biz-1", { industry: "other" });
    expect((await POST(request())).status).toBe(409);
    expect(currentDb.__peek(collection, "pricing")).toBeUndefined();
  });
});
