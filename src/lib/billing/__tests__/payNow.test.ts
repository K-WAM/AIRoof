import { describe, expect, it } from "vitest";
import { payNowAvailability, type PayNowBusiness } from "../payNow";
import { createPayToken, invoicePayUrl, PAY_TOKEN_LIFETIME, verifyPayToken } from "../payNowToken";

const business: PayNowBusiness = { stripeConfigured: true, stripeConnect: { accountId: "acct_a", chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, updatedAt: 1 }, billingPrefs: { payNow: true } };
const invoice = { status: "sent" as const, total: 100, amountPaid: 25 };
describe("Pay now availability", () => {
  it.each([
    ["billing off", { products: { billing: false } }], ["field off", { products: { field: false } }],
    ["Stripe missing", { stripeConfigured: false }], ["account missing", { stripeConnect: undefined }],
    ["charges disabled", { stripeConnect: { ...business.stripeConnect!, chargesEnabled: false } }],
    ["opt out", { billingPrefs: { payNow: false } }], ["default off", { billingPrefs: {} }],
    ["evaluation empty", { outboundEmailAllowlist: [] }], ["evaluation allowed", { outboundEmailAllowlist: ["owner@example.test"] }],
  ] as Array<[string, Partial<PayNowBusiness>]>)('refuses %s', (_, patch) => expect(payNowAvailability({ ...business, ...patch }, invoice)).toBe(false));
  it.each(["draft", "void", "paid"] as const)("refuses %s invoices", status => expect(payNowAvailability(business, { ...invoice, status })).toBe(false));
  it("accepts sent and partly paid, refuses zero balance", () => {
    expect(payNowAvailability(business, invoice)).toBe(true);
    expect(payNowAvailability(business, { ...invoice, amountPaid: 0 })).toBe(true);
    expect(payNowAvailability(business, { ...invoice, amountPaid: 100 })).toBe(false);
  });
});
describe("invoice pay tokens", () => {
  it("creates 256-bit tokens and stores a hash with a 90-day expiry", () => {
    const created = createPayToken(100);
    expect(created.token).toMatch(/^[a-f0-9]{64}$/);
    expect(created.payTokenHash).not.toBe(created.token);
    expect(created.payTokenExpiresAt).toBe(100 + PAY_TOKEN_LIFETIME);
    expect(verifyPayToken(created.token, created, 101)).toBe(true);
    expect(verifyPayToken(created.token, created, created.payTokenExpiresAt)).toBe(false);
    expect(verifyPayToken("bad", created, 101)).toBe(false);
    expect(verifyPayToken(created.token, { ...created, payTokenHash: "bad" }, 101)).toBe(false);
    const rotated = createPayToken(101);
    expect(verifyPayToken(created.token, rotated, 102)).toBe(false);
    expect(new URL(invoicePayUrl("https://app.test", "b", "INV-1", rotated.token)).searchParams.get("t")).toBe(rotated.token);
  });
});
