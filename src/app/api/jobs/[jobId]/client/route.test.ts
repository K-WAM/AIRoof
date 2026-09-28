import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

let db = makeFakeDb();
let allowed = true;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: async () => allowed ? { user: { uid: "staff" } } : { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) },
}));
import { PATCH } from "./route";

const call = (body: Record<string, unknown>, jobId = "J-1017") => PATCH(
  new NextRequest(`http://localhost/api/jobs/${jobId}/client`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ businessId: "biz", ...body }) }),
  { params: Promise.resolve({ jobId }) },
);

beforeEach(() => {
  db = makeFakeDb();
  allowed = true;
  db.__seed("businesses/biz/jobs", "J-1017", {
    jobId: "J-1017", status: "open", clientName: "Kareem", clientPhone: "+18254887791", address: "317 West Riverbend Drive, Sunrise, Florida",
    customerId: "cust-1", quoteId: "Q-1", invoiceId: "INV-1",
  });
  db.__seed("businesses/biz/customers", "cust-1", { customerId: "cust-1", name: "Kareem", phone: "+18254887791", address: "317 West Riverbend Drive, Sunrise, Florida" });
  db.__seed("businesses/biz/quotes", "Q-1", { status: "draft", billTo: { name: "Kareem", address: "317 West Riverbend Drive, Sunrise, Florida" } });
  db.__seed("businesses/biz/invoices", "INV-1", { status: "draft", billTo: { name: "Kareem", address: "317 West Riverbend Drive, Sunrise, Florida" } });
});

describe("PATCH /api/jobs/[jobId]/client", () => {
  it("fixes the bill-to address on the job, the customer, and the draft quote and invoice together", async () => {
    const response = await call({ name: "Kareem Awad", email: "kareem@example.com", address: "317 West Riverbend Drive, Sunrise, FL 33322" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ updated: { customer: true, quote: true, invoice: true } });
    expect(db.__peek("businesses/biz/jobs", "J-1017")).toMatchObject({ clientName: "Kareem Awad", clientEmail: "kareem@example.com", address: "317 West Riverbend Drive, Sunrise, FL 33322", clientPhone: "+18254887791" });
    const customer = db.__peek("businesses/biz/customers", "cust-1");
    expect(customer).toMatchObject({ name: "Kareem Awad", email: "kareem@example.com", address: "317 West Riverbend Drive, Sunrise, FL 33322" });
    expect(customer?.matchKey).toBe("kareem awad|4887791");
    expect(db.__peek("businesses/biz/quotes", "Q-1")?.billTo).toEqual({ name: "Kareem Awad", email: "kareem@example.com", phone: "+18254887791", address: "317 West Riverbend Drive, Sunrise, FL 33322" });
    expect(db.__peek("businesses/biz/invoices", "INV-1")?.billTo).toMatchObject({ address: "317 West Riverbend Drive, Sunrise, FL 33322" });
  });

  it("never rewrites a quote the customer already has", async () => {
    db.__seed("businesses/biz/quotes", "Q-1", { status: "sent", billTo: { name: "Kareem", address: "old" } });
    await call({ address: "new address 33322" });
    expect(db.__peek("businesses/biz/quotes", "Q-1")?.billTo).toEqual({ name: "Kareem", address: "old" });
  });

  it("is locked once the invoice has been sent", async () => {
    db.__seed("businesses/biz/invoices", "INV-1", { status: "sent", billTo: { name: "Kareem" } });
    const response = await call({ address: "somewhere else" });
    expect(response.status).toBe(409);
    expect(db.__peek("businesses/biz/jobs", "J-1017")?.address).toBe("317 West Riverbend Drive, Sunrise, Florida");
  });

  it("rejects bad input and other businesses' users", async () => {
    expect((await call({ email: "not-an-email" })).status).toBe(400);
    expect((await call({ name: "   " })).status).toBe(400);
    expect((await call({ address: "<script>" })).status).toBe(400);
    expect((await call({})).status).toBe(400);
    expect((await call({ name: "X" }, "J-404")).status).toBe(404);
    allowed = false;
    expect((await call({ name: "X" })).status).toBe(403);
  });
});
