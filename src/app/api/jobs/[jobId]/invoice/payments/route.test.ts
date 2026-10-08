import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), firestore: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: mocks.verify }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.firestore }));
vi.mock("@/lib/comms/send", () => ({ sendEmail: mocks.send }));
import { POST } from "./route";

const context = { params: Promise.resolve({ jobId: "j" }) };
const request = (body: Record<string, unknown>) => new NextRequest("http://localhost/api/jobs/j/invoice/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
let db: ReturnType<typeof makeFakeDb>;
const sentInvoice = { status: "sent", total: 300, amountPaid: 0, billTo: { name: "Ana", email: "ana@example.com" }, sentTo: "ana@example.com" };

beforeEach(() => {
  db = makeFakeDb();
  db.__seed("businesses", "b", { businessName: "Roof Co" });
  db.__seed("businesses/b/jobs", "j", { invoiceId: "INV-1" });
  db.__seed("businesses/b/invoices", "INV-1", sentInvoice);
  mocks.verify.mockReset().mockResolvedValue({ user: { uid: "u" } });
  mocks.firestore.mockReset().mockReturnValue(db);
  mocks.send.mockReset().mockResolvedValue({ status: "delivered" });
});

describe("Record payment", () => {
  it("adds up partial payments, emails a receipt each time, and marks paid on the last one", async () => {
    const first = await POST(request({ businessId: "b", amount: 100, method: "check" }), context);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ balance: 200, receipt: "sent" });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: "ana@example.com", fromName: "Roof Co" }));
    expect(db.__peek("businesses/b/invoices", "INV-1")).toMatchObject({ status: "sent", amountPaid: 100 });

    const last = await POST(request({ businessId: "b", amount: 200, method: "zelle", sendReceipt: false }), context);
    expect(await last.json()).toMatchObject({ balance: 0, receipt: "skipped" });
    expect(db.__peek("businesses/b/invoices", "INV-1")).toMatchObject({ status: "paid", amountPaid: 300, paidAt: expect.any(Number) });
    expect((db.__peek("businesses/b/invoices", "INV-1") as { payments: unknown[] }).payments).toHaveLength(2);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("refuses an overpayment, a draft, a paid invoice and a foreign tenant", async () => {
    expect((await POST(request({ businessId: "b", amount: 300.01, method: "cash" }), context)).status).toBe(400);
    db.__seed("businesses/b/invoices", "INV-1", { ...sentInvoice, status: "draft" });
    expect((await POST(request({ businessId: "b", amount: 10, method: "cash" }), context)).status).toBe(409);
    db.__seed("businesses/b/invoices", "INV-1", { ...sentInvoice, status: "paid", amountPaid: 300 });
    expect((await POST(request({ businessId: "b", amount: 10, method: "cash" }), context)).status).toBe(409);
    mocks.verify.mockResolvedValueOnce({ error: new Response(null, { status: 403 }) });
    expect((await POST(request({ businessId: "other", amount: 10, method: "cash" }), context)).status).toBe(403);
  });

  it("keeps the payment when the receipt email fails", async () => {
    mocks.send.mockResolvedValueOnce({ status: "failed" });
    const res = await POST(request({ businessId: "b", amount: 50, method: "card" }), context);
    expect(await res.json()).toMatchObject({ receipt: "failed", balance: 250 });
    expect(db.__peek("businesses/b/invoices", "INV-1")).toMatchObject({ amountPaid: 50 });
  });
});
