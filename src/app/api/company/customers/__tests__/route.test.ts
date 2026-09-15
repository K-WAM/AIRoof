import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";
import { buildSearchTokens, buildMatchKey } from "@/lib/customers/search";

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

import { GET, POST } from "@/app/api/company/customers/route";

function seedCustomer(db: FakeDb, id: string, name: string, opts: { phone?: string; address?: string; lastJobAt?: number; jobCount?: number } = {}) {
  db.__seed("businesses/biz-1/customers", id, {
    customerId: id, businessId: "biz-1", name,
    kind: "residential",
    phone: opts.phone, address: opts.address,
    jobCount: opts.jobCount ?? 0,
    lastJobAt: opts.lastJobAt ?? 1000,
    matchKey: buildMatchKey({ name, phone: opts.phone }),
    searchTokens: buildSearchTokens({ name, phone: opts.phone, address: opts.address }),
    active: true, createdAt: 1000, updatedAt: 1000,
  });
}

describe("GET /api/company/customers", () => {
  beforeEach(() => {
    mocks.verifyAuthAndRole.mockReset();
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "u1" } });
    currentDb = makeFakeDb();
    currentDb.__seed("businesses", "biz-1", { businessName: "Apex Roofing" });
  });

  it("returns the slim list ordered by lastJobAt desc", async () => {
    seedCustomer(currentDb, "C-1000", "Walmart #2291", { lastJobAt: 500 });
    seedCustomer(currentDb, "C-1001", "Kevin Reyes", { lastJobAt: 2000 });

    const res = await GET(new NextRequest("http://localhost/api/company/customers?businessId=biz-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.customers.map((c: { customerId: string }) => c.customerId)).toEqual(["C-1001", "C-1000"]);
    expect(body.truncated).toBe(false);
    // Never leaks the internal search index to the client.
    expect(body.customers[0].searchTokens).toBeUndefined();
    expect(body.customers[0].matchKey).toBeUndefined();
  });

  it("falls back to the searchTokens query when ?q= is given", async () => {
    seedCustomer(currentDb, "C-1000", "Walmart #2291");
    seedCustomer(currentDb, "C-1001", "Kevin Reyes");

    const res = await GET(new NextRequest("http://localhost/api/company/customers?businessId=biz-1&q=wal"));
    const body = await res.json();

    expect(body.customers).toHaveLength(1);
    expect(body.customers[0].customerId).toBe("C-1000");
  });

  it("matches a phone-digit query via the fallback", async () => {
    seedCustomer(currentDb, "C-1000", "Walmart #2291", { phone: "+1 (305) 555-0123" });

    const res = await GET(new NextRequest("http://localhost/api/company/customers?businessId=biz-1&q=0123"));
    const body = await res.json();

    expect(body.customers).toHaveLength(1);
    expect(body.customers[0].customerId).toBe("C-1000");
  });

  it("400s without businessId", async () => {
    const res = await GET(new NextRequest("http://localhost/api/company/customers"));
    expect(res.status).toBe(400);
    expect(mocks.verifyAuthAndRole).not.toHaveBeenCalled();
  });

  it("passes through an auth rejection", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    const res = await GET(new NextRequest("http://localhost/api/company/customers?businessId=biz-1"));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/company/customers", () => {
  beforeEach(() => {
    mocks.verifyAuthAndRole.mockReset();
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "u1" } });
    currentDb = makeFakeDb();
    currentDb.__seed("businesses", "biz-1", { businessName: "Apex Roofing" });
  });

  function requestFor(body: unknown) {
    return new NextRequest("http://localhost/api/company/customers", { method: "POST", body: JSON.stringify(body) });
  }

  it("creates a new customer with a C-1000-style id and extra fields", async () => {
    const res = await POST(requestFor({
      businessId: "biz-1", name: "Jane Smith", phone: "3055550123", notes: "Gate code 4421", tags: ["vip"],
    }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.customer.customerId).toBe("C-1000");
    expect(body.customer.notes).toBe("Gate code 4421");
    expect(body.customer.tags).toEqual(["vip"]);
    expect(body.customer.jobCount).toBe(0);
  });

  it("allocates sequential ids across multiple creates", async () => {
    const a = await POST(requestFor({ businessId: "biz-1", name: "Customer A" })).then((r) => r.json());
    const b = await POST(requestFor({ businessId: "biz-1", name: "Customer B" })).then((r) => r.json());
    expect(a.customer.customerId).toBe("C-1000");
    expect(b.customer.customerId).toBe("C-1001");
  });

  it("409s instead of creating a duplicate when the identity already matches", async () => {
    seedCustomer(currentDb, "C-1000", "Jane Smith", { phone: "3055550123" });
    const res = await POST(requestFor({ businessId: "biz-1", name: "Jane Smith", phone: "3055550123" }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.customerId).toBe("C-1000");
  });

  it("400s without a name", async () => {
    const res = await POST(requestFor({ businessId: "biz-1" }));
    expect(res.status).toBe(400);
    expect(mocks.verifyAuthAndRole).not.toHaveBeenCalled();
  });

  it("400s on an invalid kind", async () => {
    const res = await POST(requestFor({ businessId: "biz-1", name: "X", kind: "enterprise" }));
    expect(res.status).toBe(400);
  });
});
