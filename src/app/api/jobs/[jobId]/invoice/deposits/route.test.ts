import { NextRequest } from "next/server";
import { beforeEach, it, expect, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), db: vi.fn(), send: vi.fn(), photos: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyOwnBusinessRole: mocks.guard, verifyOwnBusinessOrSuperadmin: mocks.guard, verifyAuthAndRole: mocks.guard }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.db }));
vi.mock("@/lib/comms/send", () => ({ isCommsConfigured: () => true, sendEmail: mocks.send }));
vi.mock("@/lib/photos/store", () => ({ listPhotoMetas: mocks.photos, getPhotoBlobs: vi.fn().mockResolvedValue({}) }));
import { POST, PATCH } from "./route";
import { GET as FINAL, POST as CREATE_FINAL } from "../route";
import { POST as SEND } from "../send/route";
import { POST as PAY } from "../payments/route";
import { claimInvoiceSend, finishInvoiceSend } from "@/lib/billing/jobInvoiceStore";
const ctx = { params: Promise.resolve({ jobId: "j" }) };
const req = (body: unknown) => new NextRequest("http://localhost/api/jobs/j/invoice", { method: "POST", body: JSON.stringify(body) });
const get = () => FINAL(new NextRequest("http://localhost/api/jobs/j/invoice?businessId=b"), ctx);
let db: ReturnType<typeof makeFakeDb>;
beforeEach(() => {
  db = makeFakeDb(); mocks.db.mockReturnValue(db); mocks.guard.mockResolvedValue({ user: { uid: "u", businessId: "b" } }); mocks.send.mockReset().mockResolvedValue({ status: "delivered" }); mocks.photos.mockResolvedValue([]);
  db.__seed("businesses", "b", { businessName: "Example", industry: "roofing" });
  db.__seed("businesses/b/jobs", "j", { jobId: "j", businessId: "b", title: "Service", clientName: "Customer", status: "quoted", quoteId: "Q-1" });
  db.__seed("businesses/b/quotes", "Q-1", { status: "accepted", lines: [{ lineId: "work", kind: "other", description: "Service", quantity: 1, unitPrice: 8000 }], subtotal: 8000 });
});
const create = async (requestId = "request-one", percent = 50) => {
  const r = await POST(req({ requestId, percent }), ctx); expect(r.status).toBe(201); return (await r.json()).invoice;
};
it("rejects denied requests and never stores under a request-selected tenant", async () => {
  mocks.guard.mockResolvedValueOnce({ error: new Response(null, { status: 403 }) });
  expect((await POST(req({ requestId: "request-one" }), ctx)).status).toBe(403);
  const invoice = await create(); expect(invoice.businessId).toBe("b"); expect(invoice.total).toBe(4000);
  expect(db.__peek("businesses/b/jobs", "j")?.invoiceId).toBeUndefined();
  expect((await create()).invoiceId).toBe(invoice.invoiceId);
});
it("sends deposits separately; draft final recomputes; deposit payment never completes the job", async () => {
  const deposit = await create();
  const standard = await CREATE_FINAL(req({ businessId: "b" }), ctx); expect(standard.status).toBe(201);
  expect((await SEND(req({ businessId: "b", invoiceId: deposit.invoiceId, to: "a@example.test" }), ctx)).status).toBe(200);
  const final = (await (await get()).json()).invoice;
  expect(final.kind).not.toBe("deposit"); expect(final.total).toBe(4000); expect(final.depositsApplied).toEqual([{ invoiceId: deposit.invoiceId, amount: 4000 }]);
  expect(db.__peek("businesses/b/jobs", "j")?.status).toBe("quoted");
  expect((await PAY(req({ businessId: "b", invoiceId: deposit.invoiceId, amount: 4000, method: "check", sendReceipt: false }), ctx)).status).toBe(200);
  expect((await (await get()).json()).invoice.total).toBe(4000);
  expect(db.__peek("businesses/b/jobs", "j")?.status).toBe("quoted");
});
it("two deposits, void recomputation and sent-final immutability", async () => {
  const first = await create("request-one", 25), second = await create("request-two", 25);
  await CREATE_FINAL(req({ businessId: "b" }), ctx);
  for (const d of [first, second]) expect((await SEND(req({ businessId: "b", invoiceId: d.invoiceId, to: "a@example.test" }), ctx)).status).toBe(200);
  expect((await (await get()).json()).invoice.total).toBe(4000);
  expect((await PATCH(req({ invoiceId: first.invoiceId, status: "void" }), ctx)).status).toBe(200);
  expect((await (await get()).json()).invoice.total).toBe(6000);
  expect((await SEND(req({ businessId: "b", to: "a@example.test" }), ctx)).status).toBe(200);
  await PATCH(req({ invoiceId: second.invoiceId, status: "void" }), ctx);
  expect((await (await get()).json()).invoice.total).toBe(6000);
  expect((await POST(req({ requestId: "request-three", percent: 10 }), ctx)).status).toBe(409);
});
it("serializes final and deposit sends, and releases failed delivery", async () => {
  const deposit = await create(); await CREATE_FINAL(req({ businessId: "b" }), ctx);
  const claim = await claimInvoiceSend(db as unknown as FirebaseFirestore.Firestore, "b", "j", deposit.invoiceId);
  expect((await SEND(req({ businessId: "b", to: "a@example.test" }), ctx)).status).toBe(409);
  expect((await POST(req({ requestId: "request-two", percent: 10 }), ctx)).status).toBe(409);
  await finishInvoiceSend(db as unknown as FirebaseFirestore.Firestore, "b", "j", deposit.invoiceId, claim.token, "a@example.test", "u", false);
  mocks.send.mockResolvedValueOnce({ status: "failed" });
  expect((await SEND(req({ businessId: "b", invoiceId: deposit.invoiceId, to: "a@example.test" }), ctx)).status).toBe(502);
  expect(db.__peek("businesses/b/jobs", "j")?.documentSendLock).toBeUndefined();
  expect(db.__peek("businesses/b/invoices", deposit.invoiceId)?.status).toBe("draft");
});
