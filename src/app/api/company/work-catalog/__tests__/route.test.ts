import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";
import { WORK_CATALOG_MAX_ITEMS, type WorkCatalogItem } from "@/types/workCatalog";

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

import { GET, PUT } from "@/app/api/company/work-catalog/route";

function baseItem(over: Partial<WorkCatalogItem> = {}): WorkCatalogItem {
  return {
    itemId: "starter-roofing-leak",
    category: "Leaks",
    problem: "Water stain at the interior ceiling",
    solution: "Trace the entry point and repair the source.",
    severity: "high",
    starter: true,
    createdAt: 1000,
    ...over,
  };
}

// Adversarial builder: arbitrary junk can ride along (exactly what the server
// must reject), so it casts instead of type-checking.
function rawItem(over: Record<string, unknown> = {}): WorkCatalogItem {
  return {
    itemId: "starter-roofing-leak",
    category: "Leaks",
    problem: "Water stain at the interior ceiling",
    solution: "Trace the entry point and repair the source.",
    severity: "high",
    starter: true,
    createdAt: 1000,
    ...over,
  } as WorkCatalogItem;
}

function putRequest(body: unknown) {
  return new NextRequest("http://localhost/api/company/work-catalog", { method: "PUT", body: JSON.stringify(body) });
}

function seedCatalog(db: FakeDb, data: Record<string, unknown>) {
  db.__seed("businesses/biz-1/library", "workCatalog", data);
}

describe("GET /api/company/work-catalog", () => {
  beforeEach(() => {
    mocks.verifyAuthAndRole.mockReset();
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "u1" } });
    currentDb = makeFakeDb();
    currentDb.__seed("businesses", "biz-1", { businessName: "Apex Roofing" });
  });

  it("400s without businessId, never touching auth or Firestore", async () => {
    const res = await GET(new NextRequest("http://localhost/api/company/work-catalog"));
    expect(res.status).toBe(400);
    expect(mocks.verifyAuthAndRole).not.toHaveBeenCalled();
  });

  it("passes through an auth rejection", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    const res = await GET(new NextRequest("http://localhost/api/company/work-catalog?businessId=biz-1"));
    expect(res.status).toBe(403);
  });

  it("returns an empty catalog when none is stored, with a no-store policy", async () => {
    const res = await GET(new NextRequest("http://localhost/api/company/work-catalog?businessId=biz-1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.catalog).toEqual({ items: [] });
  });

  it("returns the stored catalog", async () => {
    seedCatalog(currentDb, { items: [baseItem()], updatedAt: 2000 });
    const res = await GET(new NextRequest("http://localhost/api/company/work-catalog?businessId=biz-1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.catalog.items).toHaveLength(1);
    expect(body.catalog.items[0].problem).toBe("Water stain at the interior ceiling");
  });
});

describe("PUT /api/company/work-catalog", () => {
  beforeEach(() => {
    mocks.verifyAuthAndRole.mockReset();
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "u1" } });
    currentDb = makeFakeDb();
    currentDb.__seed("businesses", "biz-1", { businessName: "Apex Roofing" });
  });

  it("400s without businessId", async () => {
    const res = await PUT(putRequest({ items: [] }));
    expect(res.status).toBe(400);
    expect(mocks.verifyAuthAndRole).not.toHaveBeenCalled();
  });

  it("passes through an auth rejection", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    const res = await PUT(putRequest({ businessId: "biz-1", items: [] }));
    expect(res.status).toBe(403);
  });

  it("400s when items is not an array", async () => {
    const res = await PUT(putRequest({ businessId: "biz-1", items: "nope" }));
    expect(res.status).toBe(400);
  });

  it(`400s when more than ${WORK_CATALOG_MAX_ITEMS} items are sent`, async () => {
    const items = Array.from({ length: WORK_CATALOG_MAX_ITEMS + 1 }, (_, i) => baseItem({ itemId: `i-${i}` }));
    const res = await PUT(putRequest({ businessId: "biz-1", items }));
    expect(res.status).toBe(400);
  });

  it("400s on a missing or blank category, problem, or solution", async () => {
    for (const patch of [{ category: "" }, { problem: "" }, { solution: "" }, { category: undefined }]) {
      const res = await PUT(putRequest({ businessId: "biz-1", items: [rawItem(patch)] }));
      expect(res.status, JSON.stringify(patch)).toBe(400);
    }
  });

  it("400s when a text field exceeds its cap", async () => {
    const tooLongCategory = "x".repeat(61);
    const res = await PUT(putRequest({ businessId: "biz-1", items: [rawItem({ category: tooLongCategory })] }));
    expect(res.status).toBe(400);
  });

  it("400s when HTML sneaks into any text field", async () => {
    for (const payload of [
      { problem: "<script>alert(1)</script>" },
      { problem: "Leak <b>urgent</b>" },
      { solution: "Fix it <!-- comment -->" },
      { category: "</div>Leaks" },
    ]) {
      const res = await PUT(putRequest({ businessId: "biz-1", items: [rawItem(payload)] }));
      expect(res.status, JSON.stringify(payload)).toBe(400);
    }
  });

  it("400s on an out-of-set severity", async () => {
    const res = await PUT(putRequest({ businessId: "biz-1", items: [rawItem({ severity: "urgent" })] }));
    expect(res.status).toBe(400);
  });

  it("400s on unsound lines: bad quantity, negative price, bad kind, too many lines", async () => {
    const line = { description: "Shingle bundle", quantity: 1, unitPrice: 10, kind: "material" };
    const badLines: unknown[] = [
      [{ ...line, quantity: 0 }],
      [{ ...line, quantity: -2 }],
      [{ ...line, unitPrice: -1 }],
      [{ ...line, kind: "parts" }],
      [{ ...line, description: "<i>shingle</i>" }],
      Array.from({ length: 13 }, (_, i) => ({ ...line, description: `Line ${i}` })),
    ];
    for (const lines of badLines) {
      const res = await PUT(putRequest({ businessId: "biz-1", items: [rawItem({ lines })] }));
      expect(res.status, JSON.stringify(lines)).toBe(400);
    }
  });

  it("replaces items, stamps updatedAt, and clears nothing else", async () => {
    seedCatalog(currentDb, {
      items: [baseItem()],
      starterKitImported: ["starter-roofing-leak"],
      updatedAt: 100,
    });
    const replacement = [
      baseItem({ itemId: "custom-1", problem: "Tenant's own item", starter: undefined }),
    ];
    const res = await PUT(putRequest({ businessId: "biz-1", items: replacement }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.catalog.items).toHaveLength(1);
    expect(body.catalog.items[0].itemId).toBe("custom-1");
    expect(body.catalog.items[0].starter).toBeUndefined();

    const stored = currentDb.__peek("businesses/biz-1/library", "workCatalog");
    const storedItems = stored?.items as Array<{ itemId: string; starter?: boolean }>;
    expect(storedItems).toHaveLength(1);
    expect(storedItems[0].itemId).toBe("custom-1");
    expect(typeof stored?.updatedAt).toBe("number");
    expect(stored?.updatedAt).toBeGreaterThanOrEqual(100);
    // merge:true keeps the import history — a deleted starter item stays deleted.
    expect(stored?.starterKitImported).toEqual(["starter-roofing-leak"]);
  });

  it("accepts a fully valid payload with lines and severity", async () => {
    const items = [
      baseItem({
        lines: [
          { description: "Shingle bundle", quantity: 2, unit: "bundle", unitPrice: 40, kind: "material" },
          { description: "Shingle replacement", quantity: 3, unit: "hr", unitPrice: 85, kind: "labor" },
        ],
      }),
    ];
    const res = await PUT(putRequest({ businessId: "biz-1", items }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.catalog.items[0].lines).toHaveLength(2);
    expect(body.catalog.items[0].severity).toBe("high");
  });
});
