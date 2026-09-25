import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";
import { WORK_CATALOG_MAX_ITEMS } from "@/types/workCatalog";

const mocks = vi.hoisted(() => ({ verifyAuthAndRole: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: mocks.verifyAuthAndRole }));
let db: FakeDb;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));

import { POST } from "@/app/api/company/work-catalog/route";

const request = (body: unknown) => new NextRequest("http://localhost/api/company/work-catalog", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const ITEM = { category: "One-off", problem: "Rusted drip edge", solution: "Replace the drip edge.",
  lines: [{ description: "Drip edge", quantity: 10, unit: "ft", unitPrice: 6, kind: "material" }] };

beforeEach(() => {
  db = makeFakeDb();
  mocks.verifyAuthAndRole.mockReset();
  mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "u", role: "owner" } });
});

describe("POST /api/company/work-catalog (append one item)", () => {
  it("appends the item with a server-assigned id, keeps existing items, and returns it", async () => {
    db.__seed("businesses/biz/library", "workCatalog", { items: [{ itemId: "starter-a", category: "A", problem: "P", solution: "S", createdAt: 1 }] });
    const res = await POST(request({ businessId: "biz", item: ITEM }));
    expect(res.status).toBe(201);
    const { item } = await res.json();
    expect(item.itemId).toMatch(/^custom-/);
    expect(item.lines[0].unitPrice).toBe(6);
    const stored = db.__peek("businesses/biz/library", "workCatalog")! as { items: Array<{ itemId: string }> };
    expect(stored.items.map((i) => i.itemId)).toEqual(["starter-a", item.itemId]);
  });

  it("creates the catalog doc when none exists", async () => {
    const res = await POST(request({ businessId: "biz", item: ITEM }));
    expect(res.status).toBe(201);
    expect((db.__peek("businesses/biz/library", "workCatalog")! as { items: unknown[] }).items).toHaveLength(1);
  });

  it("ignores a client-supplied itemId and starter flag", async () => {
    const res = await POST(request({ businessId: "biz", item: { ...ITEM, itemId: "starter-evil", starter: true } }));
    const { item } = await res.json();
    expect(item.itemId).toMatch(/^custom-/);
    expect(item.starter).toBeUndefined();
  });

  it("rejects invalid items with 400 and writes nothing", async () => {
    const bad = [
      { ...ITEM, problem: "" },
      { ...ITEM, solution: "<script>x</script>" },
      { ...ITEM, lines: [{ description: "x", quantity: 0, unitPrice: 1, kind: "material" }] },
      "nope",
      null,
    ];
    for (const item of bad) {
      expect((await POST(request({ businessId: "biz", item }))).status).toBe(400);
    }
    expect(db.__peek("businesses/biz/library", "workCatalog")).toBeUndefined();
  });

  it("enforces the 300-item cap with 409", async () => {
    const items = Array.from({ length: WORK_CATALOG_MAX_ITEMS }, (_, i) => ({ itemId: `x${i}`, category: "C", problem: "P", solution: "S", createdAt: 1 }));
    db.__seed("businesses/biz/library", "workCatalog", { items });
    expect((await POST(request({ businessId: "biz", item: ITEM }))).status).toBe(409);
  });

  it("requires businessId and an authorised role", async () => {
    expect((await POST(request({ item: ITEM }))).status).toBe(400);
    mocks.verifyAuthAndRole.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await POST(request({ businessId: "other", item: ITEM }))).status).toBe(403);
  });
});
