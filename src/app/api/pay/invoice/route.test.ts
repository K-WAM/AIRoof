import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { createPayToken } from "@/lib/billing/payNowToken";
import { GET, POST } from "./route";

const mock = vi.hoisted(() => ({ create: vi.fn(), configured: true }));
let db: ReturnType<typeof makeFakeDb>;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/billing/stripePayments", () => ({ isStripeConfigured: () => mock.configured, getStripeClient: () => ({ checkout: { sessions: { create: mock.create } } }) }));
const token = createPayToken();
const business = { businessName: "A & B <Roofing>", stripeConnect: { accountId: "acct_a", chargesEnabled: true }, billingPrefs: { payNow: true } };
const invoice = { businessId: "a", invoiceId: "INV-1", jobId: "job1", status: "sent", total: 123, amountPaid: 23, payTokenHash: token.payTokenHash, payTokenExpiresAt: token.payTokenExpiresAt, billTo: { name: "SECRET CUSTOMER", address: "SECRET ADDRESS" } };
const request = (method = "GET", extra: Record<string, string> = {}) => {
  const fields = { b: "a", i: "INV-1", t: token.token, ...(method === "POST" ? { method: "card" } : {}), ...extra };
  const search = new URLSearchParams(fields);
  return new NextRequest(`https://app.test/api/pay/invoice${method === "GET" ? `?${search}` : ""}`, { method, ...(method === "POST" ? { body: search, headers: { "content-type": "application/x-www-form-urlencoded" } } : {}) });
};
beforeEach(() => {
  vi.clearAllMocks(); mock.configured = true; db = makeFakeDb();
  db.__seed("businesses", "a", business);
  db.__seed("businesses/a/invoices", "INV-1", invoice);
  db.__seed("businesses/a/jobs", "job1", { invoiceId: "INV-1" });
  mock.create.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/test", id: "cs_test" });
});
describe("public invoice payment page", () => {
  it.each([
    ["bad token", {}, {}, { t: "0".repeat(64) }],
    ["expired", {}, { payTokenExpiresAt: 1 }, {}],
    ["void", {}, { status: "void" }, {}], ["paid", {}, { status: "paid" }, {}],
    ["zero balance", {}, { amountPaid: 123 }, {}], ["draft", {}, { status: "draft" }, {}],
    ["off", { billingPrefs: { payNow: false } }, {}, {}],
    ["not ready", { stripeConnect: { accountId: "acct_a", chargesEnabled: false } }, {}, {}],
    ["evaluation", { outboundEmailAllowlist: [] }, {}, {}],
    ["billing off", { products: { billing: false } }, {}, {}],
    ["cross tenant", {}, { businessId: "b" }, {}],
  ] as Array<[string, object, object, Record<string, string>]>)("same neutral response: %s", async (_, biz, inv, input) => {
    db.__seed("businesses", "a", { ...business, ...biz });
    db.__seed("businesses/a/invoices", "INV-1", { ...invoice, ...inv });
    for (const method of ["GET", "POST"]) {
      const res = await (method === "GET" ? GET : POST)(request(method, input));
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("This payment link isn't available. Please contact A &amp; B &lt;Roofing&gt;.");
      expect(html).not.toMatch(/SECRET|123|expired|void|evaluation|acct_a/);
    }
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("fails closed without a Stripe key", async () => {
    mock.configured = false;
    expect(await (await GET(request())).text()).toContain("This payment link isn't available.");
  });
  it("shows only the allowed invoice details with no JavaScript and private headers", async () => {
    const res = await GET(request()); const html = await res.text();
    expect(html).toContain("$100.00"); expect(html).toContain("INV-1");
    expect(html).toContain("Pay by bank (ACH)");
    expect(html).not.toMatch(/SECRET|script|acct_a/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("refuses a tampered form amount and takes the current server balance", async () => {
    await POST(request("POST", { amount: "1" })); expect(mock.create).not.toHaveBeenCalled();
    db.__seed("businesses/a/invoices", "INV-1", { ...invoice, amountPaid: 30 });
    const res = await POST(request("POST"));
    expect(res.status).toBe(303); expect(res.headers.get("location")).toContain("checkout.stripe.com");
    expect(mock.create).toHaveBeenCalledWith(expect.objectContaining({ mode: "payment", payment_method_types: ["card"],
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: 9300, product_data: { name: "Invoice INV-1" } } }],
      metadata: { businessId: "a", invoiceId: "INV-1", jobId: "job1", tokenHashPrefix: token.payTokenHash.slice(0, 8) },
    }), expect.objectContaining({ stripeAccount: "acct_a" }));
    expect(JSON.stringify(mock.create.mock.calls)).not.toContain("application_fee");
  });
  it("restricts bank Checkout to ACH and uses static result pages", async () => {
    await POST(request("POST", { method: "us_bank_account" }));
    expect(mock.create.mock.calls[0][0].payment_method_types).toEqual(["us_bank_account"]);
    expect(mock.create.mock.calls[0][0].success_url).not.toContain(token.token);
    expect(await (await GET(new NextRequest("https://app.test/api/pay/invoice?result=submitted"))).text()).toContain("when your payment clears");
  });
});
