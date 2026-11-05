import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { createHash } from "node:crypto";
import { issuePayLink, signPayToken } from "@/lib/billing/payNowToken";
import { GET, POST } from "./route";

const mock = vi.hoisted(() => ({ create: vi.fn(), configured: true }));
let db: ReturnType<typeof makeFakeDb>;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/billing/stripePayments", () => ({ isStripeConfigured: () => mock.configured, getStripeClient: () => ({ checkout: { sessions: { create: mock.create } } }) }));
const secret = "test-only-pay-link-secret-32-characters";
const state = issuePayLink({});
let token: string;
const business = { businessName: "A & B <Roofing>", stripeConnect: { accountId: "acct_a", chargesEnabled: true }, billingPrefs: { payNow: true } };
const invoice = { businessId: "a", invoiceId: "INV-1", jobId: "job1", status: "sent", total: 123, amountPaid: 23, ...state, billTo: { name: "SECRET CUSTOMER", address: "SECRET ADDRESS" } };
const request = (method = "GET", extra: Record<string, string> = {}) => {
  const fields = { b: "a", i: "INV-1", t: token, ...(method === "POST" ? { method: "card" } : {}), ...extra };
  const search = new URLSearchParams(fields);
  return new NextRequest(`https://app.test/api/pay/invoice${method === "GET" ? `?${search}` : ""}`, { method, ...(method === "POST" ? { body: search, headers: { "content-type": "application/x-www-form-urlencoded" } } : {}) });
};
beforeEach(() => {
  vi.stubEnv("PAY_LINK_SECRET", secret); vi.stubEnv("STRIPE_SECRET_KEY", "test-only");
  token = signPayToken("a", "INV-1", state.payLinkNonce);
  vi.clearAllMocks(); mock.configured = true; db = makeFakeDb();
  db.__seed("businesses", "a", business);
  db.__seed("businesses/a/invoices", "INV-1", invoice);
  db.__seed("businesses/a/jobs", "job1", { invoiceId: "INV-1" });
  mock.create.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/test", id: "cs_test" });
});
afterEach(() => vi.unstubAllEnvs());
describe("public invoice payment page", () => {
  it.each([
    ["unknown business", {}, {}, { b: "missing" }],
    ["unknown invoice", {}, {}, { i: "INV-999" }],
    ["bad token", {}, {}, { t: "0".repeat(64) }],
    ["expired", {}, { payLinkExpiresAt: 1 }, {}],
    ["void", {}, { status: "void" }, {}], ["paid", {}, { status: "paid" }, {}],
    ["zero balance", {}, { amountPaid: 123 }, {}], ["draft with valid nonce", {}, { status: "draft" }, {}],
    ["unclaimed draft", {}, { status: "draft", payLinkNonce: undefined }, {}],
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
      const baseline = await (method === "GET" ? GET : POST)(request(method, { b: "missing" }));
      expect(res.status).toBe(baseline.status);
      expect(html).toBe(await baseline.text());
      expect(html).toContain("This payment link isn't available. Please contact the business that sent you this invoice.");
      expect(html).not.toMatch(/SECRET|Roofing|123|expired|void|evaluation|acct_a/);
    }
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("fails closed without a Stripe key", async () => {
    mock.configured = false;
    const res = await GET(request());
    const unknown = await GET(request("GET", { b: "missing" }));
    expect(res.status).toBe(unknown.status);
    expect(await res.text()).toBe(await unknown.text());
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
      metadata: { businessId: "a", invoiceId: "INV-1", jobId: "job1", tokenHashPrefix: createHash("sha256").update(token).digest("hex").slice(0, 8) },
    }), expect.objectContaining({ stripeAccount: "acct_a" }));
    expect(JSON.stringify(mock.create.mock.calls)).not.toContain("application_fee");
  });
  it("restricts bank Checkout to ACH and uses static result pages", async () => {
    await POST(request("POST", { method: "us_bank_account" }));
    expect(mock.create.mock.calls[0][0].payment_method_types).toEqual(["us_bank_account"]);
    expect(mock.create.mock.calls[0][0].success_url).not.toContain(token);
    expect(await (await GET(new NextRequest("https://app.test/api/pay/invoice?result=submitted"))).text()).toContain("when your payment clears");
  });
});

it.each(["", "short"])("missing or short pay-link secret is byte-identical to unknown business: %s", async secret => {
  vi.stubEnv("PAY_LINK_SECRET", secret);
  for (const method of ["GET", "POST"]) {
    const handler = method === "GET" ? GET : POST;
    const real = await handler(request(method));
    const unknown = await handler(request(method, { b: "missing" }));
    expect(real.status).toBe(unknown.status);
    expect(await real.text()).toBe(await unknown.text());
  }
});
