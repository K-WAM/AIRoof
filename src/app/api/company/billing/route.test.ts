import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";
import { invalidateProducts, loadProducts } from "@/lib/products/productCache";

const m = vi.hoisted(() => ({ db: null as FakeDb | null }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => m.db }));
vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: async () => ({ user: { uid: "u", role: "owner", businessId: "a", superadmin: false } }),
}));
import { GET } from "./route";

const req = () => new NextRequest("http://localhost/api/company/billing?businessId=a");
const rdsf = { id: "rdsf", name: "Roof Pros South", shortName: "RDSF", isDefault: true };
const rcu = { id: "rcu", name: "Concepts Unlimited", shortName: "RCU" };

beforeEach(() => {
  m.db = makeFakeDb();
  invalidateProducts("a");
});

describe("GET /api/company/billing company reads (T-317 fix)", () => {
  it("single-company: reuses the product guard's business read instead of reading it again", async () => {
    m.db!.__seed("businesses", "a", { billingCompanies: [rdsf] });
    await loadProducts(m.db as never, "a");
    const collections = vi.spyOn(m.db!, "collection");
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(collections.mock.calls.filter(([name]) => name === "businesses")).toHaveLength(0);
    expect((await res.json()).companies).toBeUndefined();
  });

  it("multi-company: returns the company list and each row's effective company", async () => {
    const now = Date.UTC(2026, 10, 5);
    m.db!.__seed("businesses", "a", { billingCompanies: [rdsf, rcu] });
    m.db!.__seed("businesses/a/invoices", "INV-1", {
      jobId: "J-1", companyId: "rcu", billTo: { name: "Lakeview County Schools" },
      total: 100, amountPaid: 0, status: "sent", createdAt: now, updatedAt: now, payments: [],
    });
    const body = await (await GET(req())).json();
    expect(body.companies).toEqual(expect.arrayContaining([expect.objectContaining({ id: "rcu", shortName: "RCU" })]));
    expect(body.unpaid[0]).toMatchObject({ invoiceId: "INV-1", companyId: "rcu" });
  });
});
