import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { POST } from "./route";
import { verifyPayToken } from "@/lib/billing/payNowToken";
import type { JobInvoice } from "@/types/invoice";

const mocks = vi.hoisted(() => ({ send: vi.fn(), claim: vi.fn(), finish: vi.fn(), guard: vi.fn(), configured: true }));
let db: ReturnType<typeof makeFakeDb>;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyOwnBusinessRole: mocks.guard }));
vi.mock("@/lib/comms/send", () => ({ isCommsConfigured: () => true, sendEmail: mocks.send }));
vi.mock("@/lib/billing/jobInvoiceStore", () => ({ claimInvoiceSend: mocks.claim, finishInvoiceSend: mocks.finish }));
vi.mock("@/lib/billing/stripePayments", () => ({ isStripeConfigured: () => mocks.configured }));
vi.mock("@/lib/photos/store", () => ({ listPhotoMetas: async () => [] }));
vi.mock("@/lib/documents/photoSelection", () => ({ loadDocumentPhotos: async () => ({ photos: [] }) }));
const invoice: JobInvoice = { invoiceId: "INV-1", businessId: "a", jobId: "j", status: "draft", billTo: { name: "Customer" }, labor: [], materials: [], other: [{ lineId: "one", description: "Service", amount: 100 }], total: 100, subtotal: 100, taxRate: 0, taxAmount: 0, createdAt: 1,
  hideMaterials: false, laborSubtotal: 0, materialSubtotal: 0, otherSubtotal: 100, updatedAt: 1, createdBy: "owner" };
const business = { businessName: "A", stripeConnect: { accountId: "acct_a", chargesEnabled: true }, billingPrefs: { payNow: true } };
const request = () => new NextRequest("https://app.test/api/jobs/j/invoice/send", { method: "POST", body: JSON.stringify({ businessId: "attacker-tenant", to: "c@example.test" }) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.configured = true; db = makeFakeDb();
  db.__seed("businesses", "a", business); db.__seed("businesses/a/jobs", "j", {});
  mocks.guard.mockResolvedValue({ user: { uid: "owner", role: "owner", businessId: "a" } });
  mocks.claim.mockResolvedValue({ invoice, job: {}, token: "send-lock" });
  mocks.send.mockResolvedValue({ status: "delivered" });
  mocks.finish.mockResolvedValue(undefined);
});
describe("invoice sending Pay now", () => {
  it("adds a button only on eligible sends, with a rotated hash finalized after delivery", async () => {
    const response = await POST(request(), { params: Promise.resolve({ jobId: "j" }) });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(mocks.send.mock.calls[0][0].html).toContain(">Pay now</a>");
    expect(mocks.send.mock.calls[0][0].businessId).toBe("a");
    expect(mocks.claim.mock.calls[0][1]).toBe("a");
    const saved = mocks.finish.mock.calls[0][8];
    expect(saved).toEqual({ payTokenHash: data.payNow.hash, payTokenExpiresAt: data.payNow.expiresAt });
    expect(saved).not.toHaveProperty("token");
    const token = new URL(data.payNow.url).searchParams.get("t")!;
    expect(verifyPayToken(token, saved)).toBe(true);
    const resent = await (await POST(request(), { params: Promise.resolve({ jobId: "j" }) })).json();
    expect(resent.payNow.hash).not.toBe(data.payNow.hash);
  });
  it.each([
    ["evaluation", { outboundEmailAllowlist: [] }], ["off", { billingPrefs: { payNow: false } }],
    ["not ready", { stripeConnect: { accountId: "acct_a", chargesEnabled: false } }], ["product off", { products: { billing: false } }],
  ])("never adds a Stripe button for %s", async (_, patch) => {
    db.__seed("businesses", "a", { ...business, ...patch });
    const data = await (await POST(request(), { params: Promise.resolve({ jobId: "j" }) })).json();
    expect(data.payNow).toBeNull(); expect(mocks.send.mock.calls[0][0].html).not.toContain(">Pay now</a>");
  });
  it("does not activate or rotate a token when sending fails", async () => {
    mocks.send.mockResolvedValue({ status: "failed" });
    expect((await POST(request(), { params: Promise.resolve({ jobId: "j" }) })).status).toBe(502);
    expect(mocks.finish).toHaveBeenCalledTimes(1);
    expect(mocks.finish.mock.calls[0][7]).toBe(false);
    expect(mocks.finish.mock.calls[0][8]).toBeUndefined();
  });
  it("does not add a button without a key or for paid invoices", async () => {
    mocks.configured = false;
    expect((await (await POST(request(), { params: Promise.resolve({ jobId: "j" }) })).json()).payNow).toBeNull();
    mocks.configured = true;
    mocks.claim.mockResolvedValue({ invoice: { ...invoice, status: "paid" }, job: {}, token: "send-lock" });
    expect((await (await POST(request(), { params: Promise.resolve({ jobId: "j" }) })).json()).payNow).toBeNull();
  });
});
