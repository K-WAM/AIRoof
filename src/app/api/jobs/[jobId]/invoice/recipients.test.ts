import { NextRequest } from "next/server";
import { beforeEach, it, expect, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), db: vi.fn(), send: vi.fn(), photos: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: mocks.guard, verifyOwnBusinessRole: mocks.guard }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.db }));
vi.mock("@/lib/comms/send", () => ({ isCommsConfigured: () => true, sendEmail: mocks.send }));
vi.mock("@/lib/photos/store", () => ({ listPhotoMetas: mocks.photos, getPhotoBlobs: vi.fn().mockResolvedValue({}) }));
import { POST as QUOTE } from "../quote/send/route";
import { POST as REPORT } from "../report/send/route";
import { POST as INVOICE } from "./send/route";
import { POST as PAYMENT } from "./payments/route";
const ctx = { params: Promise.resolve({ jobId: "j" }) };
const req = (to: unknown) => new NextRequest("http://localhost/api/jobs/j/invoice", { method: "POST", body: JSON.stringify({ businessId: "b", to, amount: 20, method: "check" }) });
let db: ReturnType<typeof makeFakeDb>;
beforeEach(() => {
  db = makeFakeDb(); mocks.db.mockReturnValue(db); mocks.guard.mockResolvedValue({ user: { uid: "u", businessId: "b" } }); mocks.send.mockReset().mockResolvedValue({ status: "delivered" }); mocks.photos.mockResolvedValue([]);
  db.__seed("businesses", "b", { businessName: "Example", industry: "roofing" });
  db.__seed("businesses/b/jobs", "j", { jobId: "j", businessId: "b", title: "Service", clientName: "Customer", status: "quoted", quoteId: "Q-1", invoiceId: "INV-1" });
  db.__seed("businesses/b/quotes", "Q-1", { quoteId: "Q-1", jobId: "j", status: "draft", createdAt: 1, validUntil: Date.now() + 86400000, billTo: { name: "Customer" }, findings: [], lines: [{ lineId: "work", kind: "other", description: "Service", quantity: 1, unitPrice: 100 }], subtotal: 100, total: 100 });
  db.__seed("businesses/b/invoices", "INV-1", { invoiceId: "INV-1", businessId: "b", jobId: "j", status: "sent", billTo: { name: "Customer" }, labor: [], materials: [], other: [{ lineId: "work", description: "Service", amount: 100 }], taxRate: 0, subtotal: 100, total: 100, createdAt: 1, updatedAt: 1 });
});
it.each([QUOTE, REPORT, INVOICE, PAYMENT])("rejects six addresses and names a bad address before sending or recording money", async handler => {
  expect((await handler(req(Array.from({ length: 6 }, (_, i) => `p${i}@example.test`)), ctx)).status).toBe(400);
  const bad = await handler(req(["ok@example.test", "broken-address"]), ctx);
  expect(bad.status).toBe(400); expect((await bad.json()).error).toContain("broken-address");
  expect(mocks.send).not.toHaveBeenCalled();
  expect(db.__peek("businesses/b/invoices", "INV-1")?.amountPaid).toBeUndefined();
});
it.each([QUOTE, REPORT, INVOICE, PAYMENT])("keeps old single-string requests working", async handler => {
  expect((await handler(req("old@example.test"), ctx)).status).toBe(200);
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: "old@example.test" }));
});
it.each([QUOTE, REPORT, INVOICE, PAYMENT])("sends one copy per address and remembers defaults", async handler => {
  expect((await handler(req(["one@example.test", "two@example.test"]), ctx)).status).toBe(200);
  expect(mocks.send.mock.calls.map(call => call[0].to)).toEqual(["one@example.test", "two@example.test"]);
  expect(db.__peek("businesses/b/jobs", "j")?.documentRecipients).toEqual(["one@example.test", "two@example.test"]);
});
it("partial quote delivery keeps a valid response token for recipients who received it", async () => {
  mocks.send.mockResolvedValueOnce({ status: "delivered" }).mockResolvedValueOnce({ status: "failed" });
  const response = await QUOTE(req(["one@example.test", "two@example.test"]), ctx);
  expect(response.status).toBe(200);
  expect((await response.json()).warning).toContain("two@example.test");
  expect(db.__peek("businesses/b/quotes", "Q-1")).toMatchObject({ status: "sent", sentTo: "one@example.test", responseTokenHash: expect.any(String) });
});
