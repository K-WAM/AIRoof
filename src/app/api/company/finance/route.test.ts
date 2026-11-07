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
  it("attributes imported history through the matched customer's company", async () => {
    const rdsf = { id: "rdsf", name: "Roof Pros South", shortName: "RDSF", isDefault: true };
    const rcu = { id: "rcu", name: "Concepts Unlimited", shortName: "RCU" };
    const now = Date.UTC(2026, 10, 5);
    m.db!.__seed("businesses", "a", { showcase: { finances: true }, billingCompanies: [rdsf, rcu] });
    m.db!.__seed("businesses/a/customers", "C-1", { name: "Lakeview County Schools", companyId: "rcu" });
    m.db!.__seed("businesses/a/invoiceHistory", "jobba-0012345", {
      source: "jobba", sourceInvoiceId: "0012345", issuedAt: now, workName: "Maintenance",
      billTo: "Lakeview County Schools", customerId: "C-1", amount: 100, tax: 0, credits: 0,
      amountDue: 100, voided: false, status: "", importedAt: now,
    });
    const body = await (await GET(req())).json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({ source: "jobba", companyId: "rcu" });
    expect(body.rows[0].customerId).toBe("C-1");
    expect(body.companies).toEqual(expect.arrayContaining([expect.objectContaining({ id: "rcu", shortName: "RCU" })]));
  });
});

describe("sample work stays out of the client's numbers (T-376)", () => {
  it("an invoice made on a sample job is not a Finances row", async () => {
    const now = Date.UTC(2026, 10, 5);
    const invoice = (id: string, extra: Record<string, unknown>) => ({ invoiceId: id, businessId: "a", jobId: "j", billTo: { name: "Acme" }, status: "sent", labor: [], materials: [], other: [{ lineId: "1", description: "work", amount: 10 }], hideMaterials: false, taxRate: 0, laborSubtotal: 0, materialSubtotal: 0, otherSubtotal: 10, subtotal: 10, taxAmount: 0, total: 10, issuedAt: now, createdAt: now, updatedAt: now, createdBy: "x", ...extra });
    m.db!.__seed("businesses", "a", { showcase: { finances: true } });
    m.db!.__seed("businesses/a/invoices", "INV-1", invoice("INV-1", {}));
    m.db!.__seed("businesses/a/invoices", "INV-2", invoice("INV-2", { provenance: { origin: "luxor-sample", source: "luxor:sample-work", addedAt: 1 } }));
    const body = await (await GET(req())).json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({ invoiceNo: "INV-1" });
  });
});
