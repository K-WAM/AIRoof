import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";
const m = vi.hoisted(() => ({ db: null as FakeDb | null, role: "owner" }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => m.db }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyOwnBusinessRole: async () => m.role === "owner" ? { user: { businessId: "a", role: "owner" } } : { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }, verifyAuthAndRole: async () => ({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }) }));
import { GET } from "./route";
const req = (query = "") => new NextRequest(`http://localhost/api/company/finance${query}`);
beforeEach(() => { m.db = makeFakeDb(); m.role = "owner"; });
describe("finance gate", () => {
  it("denies non-owners and businesses without the showcase", async () => { m.role = "staff"; expect((await GET(req())).status).toBe(403); m.role = "owner"; m.db!.__seed("businesses", "a", {}); expect((await GET(req())).status).toBe(404); });
  it("rejects invalid filters", async () => { expect((await GET(req("?from=bad"))).status).toBe(400); });
  it("returns private cached data to the owner", async () => { m.db!.__seed("businesses", "a", { showcase: { finances: true } }); const res = await GET(req()); expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toContain("private"); });
  it("single-company: no companies list and no companyId on a row (today's shape)", async () => {
    const now = Date.UTC(2026, 10, 5);
    m.db!.__seed("businesses", "a", { showcase: { finances: true } });
    m.db!.__seed("businesses/a/invoices", "INV-1", { invoiceId: "INV-1", businessId: "a", jobId: "j", companyId: "rcu", billTo: { name: "Acme" }, status: "sent", labor: [], materials: [], other: [{ lineId: "1", description: "work", amount: 10 }], hideMaterials: false, taxRate: 0, laborSubtotal: 0, materialSubtotal: 0, otherSubtotal: 10, subtotal: 10, taxAmount: 0, total: 10, issuedAt: now, createdAt: now, updatedAt: now, createdBy: "x" });
    const body = await (await GET(req())).json();
    expect(body.companies).toBeUndefined();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).not.toHaveProperty("companyId");
  });
});
