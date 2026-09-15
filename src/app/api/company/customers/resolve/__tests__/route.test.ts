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

import { POST } from "@/app/api/company/customers/resolve/route";

function requestFor(body: unknown) {
  return new NextRequest("http://localhost/api/company/customers/resolve", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  mocks.verifyAuthAndRole.mockReset();
  mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "u1" } });
  currentDb = makeFakeDb();
  currentDb.__seed("businesses", "biz-1", { businessName: "Apex Roofing" });
});

describe("POST /api/company/customers/resolve", () => {
  it("creates a customer, links the job, and bumps jobCount for a novel name", async () => {
    currentDb.__seed("businesses/biz-1/jobs", "J-1", { jobId: "J-1", businessId: "biz-1", status: "open", createdAt: 5000 });

    const res = await POST(requestFor({ businessId: "biz-1", jobId: "J-1", name: "Jane Smith", phone: "3055550123" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.created).toBe(true);
    expect(currentDb.__peek("businesses/biz-1/jobs", "J-1")!.customerId).toBe(body.customerId);
    expect(currentDb.__peek("businesses/biz-1/customers", body.customerId)!.jobCount).toBe(1);
    expect(currentDb.__peek("businesses/biz-1/customers", body.customerId)!.lastJobAt).toBe(5000);
  });

  it("reuses an existing customer by identity instead of creating a duplicate", async () => {
    currentDb.__seed("businesses/biz-1/customers", "C-1000", {
      customerId: "C-1000", businessId: "biz-1", name: "Jane Smith", kind: "residential",
      phone: "3055550123", jobCount: 3, lastJobAt: 1000,
      matchKey: "jane smith|5550123", searchTokens: [], active: true, createdAt: 1000, updatedAt: 1000,
    });
    currentDb.__seed("businesses/biz-1/jobs", "J-2", { jobId: "J-2", businessId: "biz-1", status: "open", createdAt: 6000 });

    const res = await POST(requestFor({ businessId: "biz-1", jobId: "J-2", name: "Jane Smith", phone: "3055550123" }));
    const body = await res.json();

    expect(body.created).toBe(false);
    expect(body.customerId).toBe("C-1000");
    expect(currentDb.__peek("businesses/biz-1/customers", "C-1000")!.jobCount).toBe(4);
  });

  it("does not clobber a customerId the job already carries", async () => {
    currentDb.__seed("businesses/biz-1/jobs", "J-3", { jobId: "J-3", businessId: "biz-1", status: "open", createdAt: 7000, customerId: "C-already" });
    currentDb.__seed("businesses/biz-1/customers", "C-already", {
      customerId: "C-already", businessId: "biz-1", name: "Existing Link", kind: "residential",
      jobCount: 1, lastJobAt: 1000, matchKey: "existing link|", searchTokens: [], active: true, createdAt: 1000, updatedAt: 1000,
    });

    await POST(requestFor({ businessId: "biz-1", jobId: "J-3", name: "Someone Else" }));
    expect(currentDb.__peek("businesses/biz-1/jobs", "J-3")!.customerId).toBe("C-already");
  });

  it("400s without a jobId", async () => {
    const res = await POST(requestFor({ businessId: "biz-1", name: "Jane Smith" }));
    expect(res.status).toBe(400);
  });

  it("400s without a name", async () => {
    const res = await POST(requestFor({ businessId: "biz-1", jobId: "J-1" }));
    expect(res.status).toBe(400);
  });

  it("404s when the job doesn't exist", async () => {
    const res = await POST(requestFor({ businessId: "biz-1", jobId: "nope", name: "Jane Smith" }));
    expect(res.status).toBe(404);
  });

  it("passes through an auth rejection", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    const res = await POST(requestFor({ businessId: "biz-1", jobId: "J-1", name: "Jane Smith" }));
    expect(res.status).toBe(403);
  });
});
