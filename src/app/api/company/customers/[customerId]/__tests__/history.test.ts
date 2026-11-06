import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

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

import { GET } from "@/app/api/company/customers/[customerId]/history/route";

function historyRequest(customerId = "C-1000", businessId: string | null = "biz-1") {
  const query = businessId === null ? "" : `?businessId=${businessId}`;
  return new NextRequest(`http://localhost/api/company/customers/${customerId}/history${query}`);
}

function seedHistory(db: FakeDb, id: string, over: Record<string, unknown> = {}) {
  db.__seed("businesses/biz-1/jobHistory", id, {
    id,
    source: "jobba",
    sourceId: id,
    customerId: "C-1000",
    customerName: "Acme Property Group",
    status: "Complete",
    importedAt: 1000,
    ...over,
  });
}

describe("GET /api/company/customers/[customerId]/history", () => {
  beforeEach(() => {
    mocks.verifyAuthAndRole.mockReset();
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "u1" } });
    currentDb = makeFakeDb();
  });

  it("400s without businessId, never touching auth or Firestore", async () => {
    const res = await GET(historyRequest("C-1000", null), { params: Promise.resolve({ customerId: "C-1000" }) });
    expect(res.status).toBe(400);
    expect(mocks.verifyAuthAndRole).not.toHaveBeenCalled();
  });

  it("uses the same roles as the customer route, so a crew member is refused", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    const res = await GET(historyRequest(), { params: Promise.resolve({ customerId: "C-1000" }) });
    expect(res.status).toBe(403);
    expect(mocks.verifyAuthAndRole).toHaveBeenCalledWith(expect.anything(), "biz-1", ["owner", "staff", "viewer", "superadmin"]);
  });

  it("returns this customer's history newest first by dueAt", async () => {
    seedHistory(currentDb, "h-old", { dueAt: 1000, property: "12 Palm Court" });
    seedHistory(currentDb, "h-new", { dueAt: 3000, property: "Northside Plaza", kind: "work-order", description: "Seal flashing\nCheck drain" });
    seedHistory(currentDb, "h-mid", { dueAt: 2000 });

    const res = await GET(historyRequest(), { params: Promise.resolve({ customerId: "C-1000" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items[0]).toMatchObject({ kind: "work-order", description: "Seal flashing\nCheck drain" });
    expect(body.items[2].kind).toBe("inspection");
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(body.items.map((item: { id: string }) => item.id)).toEqual(["h-new", "h-mid", "h-old"]);
  });

  it("never returns another customer's history", async () => {
    seedHistory(currentDb, "mine", { customerId: "C-1000", dueAt: 1000 });
    currentDb.__seed("businesses/biz-2/jobHistory", "other-tenant", { customerId: "C-1000", id: "other-tenant" });
    seedHistory(currentDb, "theirs", { customerId: "C-9999", dueAt: 9000 });

    const res = await GET(historyRequest(), { params: Promise.resolve({ customerId: "C-1000" }) });
    const body = await res.json();

    expect(body.items.map((item: { id: string }) => item.id)).toEqual(["mine"]);
  });

  it("503s when the database is unavailable", async () => {
    currentDb = null as unknown as FakeDb;
    const res = await GET(historyRequest(), { params: Promise.resolve({ customerId: "C-1000" }) });
    expect(res.status).toBe(503);
  });
});
