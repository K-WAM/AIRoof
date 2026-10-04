import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

let db = makeFakeDb();
const sendEmail = vi.fn();
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifySuperadmin: async () => ({ user: { uid: "sa", email: "sa@luxor.test" } }) }));
vi.mock("@/lib/comms/send", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
import { PUT } from "../route";

const put = (body: unknown) => PUT(new NextRequest("http://localhost/api/admin/invoices/LX-1", { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({ invoiceId: "LX-1" }) });

beforeEach(() => {
  db = makeFakeDb();
  sendEmail.mockReset().mockResolvedValue({ status: "delivered", providerId: "m1" });
  db.__seed("luxorInvoices", "LX-1", { invoiceId: "LX-1", businessId: "biz", clientName: "Apex", clientEmail: "owner@apex.test", total: 299, status: "sent", dueDate: "2026-09-01" });
  db.__seed("businesses", "biz", { businessName: "Apex", subscriptionStatus: "paused", pausedReason: "Unpaid invoice LX-1" });
});

describe("PUT /api/admin/invoices/[id] — Mark paid", () => {
  it("emails one receipt and turns a client paused for this invoice back on", async () => {
    const res = await (await put({ status: "paid" })).json();
    expect(res).toMatchObject({ ok: true, receipt: "sent", resumed: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: "owner@apex.test", subject: "[Receipt] Payment received — LX-1" });
    const [biz] = db.__list("businesses");
    expect(biz.data.subscriptionStatus).toBe("active");
    const [invoice] = db.__list("luxorInvoices");
    expect(invoice.data).toMatchObject({ status: "paid", paidAt: expect.any(Number), receiptSentAt: expect.any(Number) });
  });

  it("never sends a second receipt, and leaves a client paused for another reason alone", async () => {
    db.__seed("businesses", "biz", { businessName: "Apex", subscriptionStatus: "paused", pausedReason: "Asked to stop" });
    await put({ status: "paid" });
    await put({ status: "sent" });
    await put({ status: "paid" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(db.__list("businesses")[0].data.subscriptionStatus).toBe("paused");
  });

  it("a failed email doesn't undo Mark paid", async () => {
    sendEmail.mockResolvedValueOnce({ status: "failed" });
    const res = await (await put({ status: "paid" })).json();
    expect(res.receipt).toBe("not_sent");
    expect(db.__list("luxorInvoices")[0].data.status).toBe("paid");
  });
});
