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

import { GET, PATCH } from "@/app/api/company/customers/[customerId]/route";

function seedCustomer(db: FakeDb, id: string, name: string, opts: { phone?: string; address?: string } = {}) {
  db.__seed("businesses/biz-1/customers", id, {
    customerId: id, businessId: "biz-1", name, kind: "residential",
    phone: opts.phone, address: opts.address,
    jobCount: 2, lastJobAt: 1000,
    matchKey: buildMatchKey({ name, phone: opts.phone }),
    searchTokens: buildSearchTokens({ name, phone: opts.phone, address: opts.address }),
    active: true, createdAt: 1000, updatedAt: 1000,
  });
}

function seedJob(db: FakeDb, id: string, customerId: string, status: string, createdAt: number) {
  db.__seed("businesses/biz-1/jobs", id, { jobId: id, businessId: "biz-1", customerId, status, title: `Job ${id}`, createdAt, updatedAt: createdAt });
}

beforeEach(() => {
  mocks.verifyAuthAndRole.mockReset();
  mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "u1" } });
  currentDb = makeFakeDb();
  currentDb.__seed("businesses", "biz-1", { businessName: "Apex Roofing" });
});

describe("GET /api/company/customers/[customerId]", () => {
  it("returns the customer and their jobs, newest first", async () => {
    seedCustomer(currentDb, "C-1000", "Walmart #2291");
    seedJob(currentDb, "J-1", "C-1000", "complete", 1000);
    seedJob(currentDb, "J-2", "C-1000", "in_progress", 2000);
    seedJob(currentDb, "J-3", "C-1001", "open", 3000); // different customer — must not appear

    const res = await GET(new NextRequest("http://localhost/api/company/customers/C-1000?businessId=biz-1"), {
      params: Promise.resolve({ customerId: "C-1000" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.customer.name).toBe("Walmart #2291");
    expect(body.jobs.map((j: { jobId: string }) => j.jobId)).toEqual(["J-2", "J-1"]);
  });

  it("404s for an unknown customer", async () => {
    const res = await GET(new NextRequest("http://localhost/api/company/customers/nope?businessId=biz-1"), {
      params: Promise.resolve({ customerId: "nope" }),
    });
    expect(res.status).toBe(404);
  });

  it("passes through an auth rejection", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    const res = await GET(new NextRequest("http://localhost/api/company/customers/C-1000?businessId=biz-1"), {
      params: Promise.resolve({ customerId: "C-1000" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/company/customers/[customerId]", () => {
  function requestFor(body: unknown) {
    return new NextRequest("http://localhost/api/company/customers/C-1000", { method: "PATCH", body: JSON.stringify(body) });
  }

  it("updates fields and recomputes matchKey/searchTokens on an identity change", async () => {
    seedCustomer(currentDb, "C-1000", "Jane Smith", { phone: "3055550123" });
    const res = await PATCH(requestFor({ businessId: "biz-1", name: "Jane Smith-Jones" }), {
      params: Promise.resolve({ customerId: "C-1000" }),
    });
    expect(res.status).toBe(200);

    const stored = currentDb.__peek("businesses/biz-1/customers", "C-1000")!;
    expect(stored.name).toBe("Jane Smith-Jones");
    expect(stored.matchKey).toBe(buildMatchKey({ name: "Jane Smith-Jones", phone: "3055550123" }));
  });

  it("does not touch matchKey/searchTokens when only non-identity fields change", async () => {
    seedCustomer(currentDb, "C-1000", "Jane Smith", { phone: "3055550123" });
    const before = currentDb.__peek("businesses/biz-1/customers", "C-1000")!;
    await PATCH(requestFor({ businessId: "biz-1", notes: "VIP" }), { params: Promise.resolve({ customerId: "C-1000" }) });
    const after = currentDb.__peek("businesses/biz-1/customers", "C-1000")!;
    expect(after.matchKey).toBe(before.matchKey);
    expect(after.notes).toBe("VIP");
  });

  it("propagate:true re-denormalizes name/phone/address onto open jobs only", async () => {
    seedCustomer(currentDb, "C-1000", "Jane Smith");
    seedJob(currentDb, "J-open", "C-1000", "in_progress", 1000);
    seedJob(currentDb, "J-done", "C-1000", "complete", 900);
    seedJob(currentDb, "J-invoiced", "C-1000", "invoiced", 950);

    const res = await PATCH(requestFor({ businessId: "biz-1", name: "Jane Smith-Jones", propagate: true }), {
      params: Promise.resolve({ customerId: "C-1000" }),
    });
    const body = await res.json();

    expect(body.propagatedCount).toBe(1);
    expect(currentDb.__peek("businesses/biz-1/jobs", "J-open")!.clientName).toBe("Jane Smith-Jones");
    // Frozen — an already-sent invoice/report must never mutate.
    expect(currentDb.__peek("businesses/biz-1/jobs", "J-done")!.clientName).toBeUndefined();
    expect(currentDb.__peek("businesses/biz-1/jobs", "J-invoiced")!.clientName).toBeUndefined();
  });

  it("does not propagate when the flag is omitted, even with an identity change", async () => {
    seedCustomer(currentDb, "C-1000", "Jane Smith");
    seedJob(currentDb, "J-open", "C-1000", "in_progress", 1000);

    await PATCH(requestFor({ businessId: "biz-1", name: "Renamed" }), { params: Promise.resolve({ customerId: "C-1000" }) });
    expect(currentDb.__peek("businesses/biz-1/jobs", "J-open")!.clientName).toBeUndefined();
  });

  it("404s for an unknown customer", async () => {
    const res = await PATCH(requestFor({ businessId: "biz-1", name: "X" }), { params: Promise.resolve({ customerId: "nope" }) });
    expect(res.status).toBe(404);
  });

  it("400s on an invalid kind", async () => {
    seedCustomer(currentDb, "C-1000", "Jane Smith");
    const res = await PATCH(requestFor({ businessId: "biz-1", kind: "bogus" }), { params: Promise.resolve({ customerId: "C-1000" }) });
    expect(res.status).toBe(400);
  });
});
