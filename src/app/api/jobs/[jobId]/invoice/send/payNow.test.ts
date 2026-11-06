import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { POST } from "./route";
import { claimInvoiceSend, finishInvoiceSend, updateStandardDraft } from "@/lib/billing/jobInvoiceStore";
import { GET as payPage, POST as checkout } from "@/app/api/pay/invoice/route";
import { verifyPayToken } from "@/lib/billing/payNowToken";
import type { JobInvoice } from "@/types/invoice";

const mocks = vi.hoisted(() => ({ send: vi.fn(), create: vi.fn(), guard: vi.fn(), configured: true }));
let db: ReturnType<typeof makeFakeDb>;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyOwnBusinessRole: mocks.guard, verifyOwnBusinessOrSuperadmin: mocks.guard }));
vi.mock("@/lib/comms/send", () => ({ isCommsConfigured: () => true, sendEmail: mocks.send }));

vi.mock("@/lib/billing/stripePayments", () => ({ isStripeConfigured: () => mocks.configured, getStripeClient: () => ({ checkout: { sessions: { create: mocks.create } } }) }));
vi.mock("@/lib/photos/store", () => ({ listPhotoMetas: async () => [] }));
vi.mock("@/lib/documents/photoSelection", () => ({ loadDocumentPhotos: async () => ({ photos: [] }) }));
const invoice: JobInvoice = { invoiceId: "INV-1", businessId: "a", jobId: "j", status: "draft", billTo: { name: "Customer" }, labor: [], materials: [], other: [{ lineId: "one", description: "Service", amount: 100 }], total: 100, subtotal: 100, taxRate: 0, taxAmount: 0, createdAt: 1,
  hideMaterials: false, laborSubtotal: 0, materialSubtotal: 0, otherSubtotal: 100, updatedAt: 1, createdBy: "owner" };
const business = { businessName: "A", stripeConnect: { accountId: "acct_a", chargesEnabled: true }, billingPrefs: { payNow: true } };
const request = () => new NextRequest("https://app.test/api/jobs/j/invoice/send", { method: "POST", body: JSON.stringify({ businessId: "attacker-tenant", to: "c@example.test" }) });
beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "test-only"); vi.stubEnv("PAY_LINK_SECRET", "test-only-pay-link-secret-32-characters");
  vi.clearAllMocks(); mocks.configured = true; db = makeFakeDb();
  db.__seed("businesses", "a", business); db.__seed("businesses/a/jobs", "j", { invoiceId: "INV-1" });
  db.__seed("businesses/a/invoices", "INV-1", { ...invoice });
  mocks.guard.mockResolvedValue({ user: { uid: "owner", role: "owner", businessId: "a" } });
  mocks.send.mockResolvedValue({ status: "delivered" });
  mocks.create.mockResolvedValue({ id: "cs_test", url: "https://checkout.stripe.com/c/pay/test" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const saved = () => db.__peek("businesses/a/invoices", "INV-1")!;
const context = { params: Promise.resolve({ jobId: "j" }) };
function verify(url: string) { return verifyPayToken(new URL(url).searchParams.get("t")!, "a", "INV-1", saved()); }
describe("invoice sending Pay now", () => {
  it("commits a working link before email delivery, and ordinary resends keep it", async () => {
    mocks.send.mockImplementation(async ({ html }) => {
      const url = html.match(/href="([^"]+)"[^>]*>Pay now<\/a>/)?.[1].replaceAll("&amp;", "&");
      expect(url).toBeTruthy();
      expect(verify(url)).toBe(true);
      return { status: "delivered" };
    });
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(mocks.send.mock.calls[0][0].businessId).toBe("a");
    expect(verify(data.payNow.url)).toBe(true);
    const resent = await (await POST(request(), context)).json();
    expect(resent.payNow.url).toBe(data.payNow.url);
  });
  it("explicit new link rotates the nonce and invalidates the old email", async () => {
    const first = await (await POST(request(), context)).json();
    const req = new NextRequest("https://app.test/api/jobs/j/invoice/send", { method: "POST", body: JSON.stringify({ to: "c@example.test", newLink: true }) });
    const next = await (await POST(req, context)).json();
    expect(next.payNow.url).not.toBe(first.payNow.url);
    expect(verify(first.payNow.url)).toBe(false);
    expect(verify(next.payNow.url)).toBe(true);
  });
  it.each([
    ["evaluation", { outboundEmailAllowlist: [] }], ["off", { billingPrefs: { payNow: false } }],
    ["not ready", { stripeConnect: { accountId: "acct_a", chargesEnabled: false } }], ["product off", { products: { billing: false } }],
  ])("never adds a Stripe button for %s", async (_, patch) => {
    db.__seed("businesses", "a", { ...business, ...patch });
    const data = await (await POST(request(), context)).json();
    expect(data.payNow).toBeNull(); expect(mocks.send.mock.calls[0][0].html).not.toContain(">Pay now</a>");
    expect(saved()).not.toHaveProperty("payLinkNonce");
  });
  it("a failed send then draft edit stays unavailable; a resend reuses the nonce for the current balance", async () => {
    mocks.send.mockResolvedValue({ status: "failed" });
    expect((await POST(request(), context)).status).toBe(502);
    expect(saved().payLinkNonce).toBeTruthy();
    expect(saved().status).toBe("draft");
    expect(db.__peek("businesses/a/jobs", "j")).not.toHaveProperty("documentSendLock");
    const nonce = saved().payLinkNonce;
    const url = mocks.send.mock.calls[0][0].html.match(/href="([^"]+)"[^>]*>Pay now<\/a>/)![1].replaceAll("&amp;", "&");
    await updateStandardDraft(db as unknown as FirebaseFirestore.Firestore, "a", "INV-1", { total: 180, amountPaid: 30, other: [{ lineId: "one", description: "Updated service", amount: 180 }], subtotal: 180, otherSubtotal: 180 });
    expect(verify(url)).toBe(true);
    const form = new URLSearchParams(new URL(url).searchParams); form.set("method", "card");
    const submit = () => checkout(new NextRequest(url, { method: "POST", body: form }));
    const neutral = await (await payPage(new NextRequest("https://app.test/api/pay/invoice?b=missing&i=INV-1&t=bad"))).text();
    expect(await (await payPage(new NextRequest(url))).text()).toBe(neutral);
    expect(await (await submit()).text()).toBe(neutral);
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.send.mockResolvedValue({ status: "delivered" });
    const resent = await (await POST(request(), context)).json();
    expect(saved()).toMatchObject({ status: "sent", payLinkNonce: nonce, total: 180, amountPaid: 30 });
    expect(resent.payNow.url).toBe(url);
    expect(await (await payPage(new NextRequest(url))).text()).toContain("$150.00");
    expect((await submit()).status).toBe(303);
    expect(mocks.create.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(15000);
  });
  it("a delivered email link stays unavailable when finalization fails", async () => {
    const real = db.runTransaction.bind(db);
    let calls = 0;
    vi.spyOn(db, "runTransaction").mockImplementation(async callback => {
      if (++calls >= 2) throw new Error("finalization unavailable");
      return real(callback);
    });
    await expect(POST(request(), context)).rejects.toThrow("finalization unavailable");
    const html = mocks.send.mock.calls[0][0].html;
    const url = html.match(/href="([^"]+)"[^>]*>Pay now<\/a>/)![1].replaceAll("&amp;", "&");
    expect(verify(url)).toBe(true);
    const page = await payPage(new NextRequest(url));
    expect(await page.text()).toContain("This payment link isn't available.");
    const form = new URLSearchParams(new URL(url).searchParams); form.set("method", "card");
    expect(await (await checkout(new NextRequest(url, { method: "POST", body: form }))).text()).toContain("This payment link isn't available.");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(saved().status).toBe("draft");
  });
  it("a resend under 30 days left rotates, but a failed finalization cannot erase it", async () => {
    const first = await claimInvoiceSend(db as unknown as FirebaseFirestore.Firestore, "a", "j");
    await finishInvoiceSend(db as unknown as FirebaseFirestore.Firestore, "a", "j", "INV-1", first.token, "c@example.test", "owner", false);
    await db.collection("businesses/a/invoices").doc("INV-1").update({ payLinkExpiresAt: Date.now() + 29 * 86400000 });
    const next = await claimInvoiceSend(db as unknown as FirebaseFirestore.Firestore, "a", "j");
    expect(next.invoice.payLinkNonce).not.toBe(first.invoice.payLinkNonce);
  });
  it("does not add a button without a key or for paid invoices", async () => {
    mocks.configured = false;
    expect((await (await POST(request(), context)).json()).payNow).toBeNull();
    mocks.configured = true;
    db.__seed("businesses/a/invoices", "INV-1", { ...invoice, status: "paid" });
    expect((await (await POST(request(), context)).json()).payNow).toBeNull();
  });
});
