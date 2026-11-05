import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { payNowAvailability, type PayNowBusiness } from "../payNow";
import { issuePayLink, signPayToken, invoicePayUrl, PAY_TOKEN_LIFETIME, verifyPayToken } from "../payNowToken";

const business: PayNowBusiness = { stripeConfigured: true, stripeConnect: { accountId: "acct_a", chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, updatedAt: 1 }, billingPrefs: { payNow: true } };
beforeEach(() => { vi.stubEnv("STRIPE_SECRET_KEY", "test-only"); vi.stubEnv("PAY_LINK_SECRET", "test-only-pay-link-secret-32-characters"); });
afterEach(() => vi.unstubAllEnvs());
const invoice = { status: "sent" as const, total: 100, amountPaid: 25 };
describe("Pay now availability", () => {
  it.each([
    ["billing off", { products: { billing: false } }], ["field off", { products: { field: false } }],
    ["Stripe missing", { stripeConfigured: false }], ["account missing", { stripeConnect: undefined }],
    ["charges disabled", { stripeConnect: { ...business.stripeConnect!, chargesEnabled: false } }],
    ["opt out", { billingPrefs: { payNow: false } }], ["default off", { billingPrefs: {} }],
    ["evaluation empty", { outboundEmailAllowlist: [] }], ["evaluation allowed", { outboundEmailAllowlist: ["owner@example.test"] }],
  ] as Array<[string, Partial<PayNowBusiness>]>)('refuses %s', (_, patch) => expect(payNowAvailability({ ...business, ...patch }, invoice)).toBe(false));
  it.each(["draft", "void", "paid"] as const)("refuses %s invoices even with a valid nonce", status => expect(payNowAvailability(business, { ...invoice, ...issuePayLink({}), status })).toBe(false));
  it("accepts sent and partly paid, refuses zero balance", () => {
    expect(payNowAvailability(business, invoice)).toBe(true);
    expect(payNowAvailability(business, { ...invoice, amountPaid: 0 })).toBe(true);
    expect(payNowAvailability(business, { ...invoice, amountPaid: 100 })).toBe(false);
  });
});
describe("invoice pay tokens", () => {
  it("binds a 256-bit HMAC to secret, nonce, tenant and invoice, with 90-day expiry", () => {
    const state = issuePayLink({}, false, 100);
    const token = signPayToken("a", "INV-1", state.payLinkNonce);
    expect(state.payLinkNonce).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(state.payLinkExpiresAt).toBe(100 + PAY_TOKEN_LIFETIME);
    expect(verifyPayToken(token, "a", "INV-1", state, 101)).toBe(true);
    expect(verifyPayToken(token, "b", "INV-1", state, 101)).toBe(false);
    expect(verifyPayToken(token, "a", "INV-2", state, 101)).toBe(false);
    expect(verifyPayToken(token, "a", "INV-1", issuePayLink({}, false, 100), 101)).toBe(false);
    expect(verifyPayToken(token, "a", "INV-1", state, state.payLinkExpiresAt)).toBe(false);
    expect(verifyPayToken("bad", "a", "INV-1", state, 101)).toBe(false);
    vi.stubEnv("PAY_LINK_SECRET", "different-test-secret-32-characters-long");
    expect(verifyPayToken(token, "a", "INV-1", state, 101)).toBe(false);
    expect(new URL(invoicePayUrl("https://app.test", "a", "INV-1", token)).searchParams.get("t")).toBe(token);
  });
  it("keeps links with at least 30 days left and rotates near expiry or on explicit request", () => {
    const state = issuePayLink({}, false, 100);
    expect(issuePayLink(state, false, 101)).toEqual(state);
    expect(issuePayLink(state, false, 100 + 60 * 86400000)).toEqual(state);
    expect(issuePayLink(state, false, 101 + 60 * 86400000).payLinkNonce).not.toBe(state.payLinkNonce);
    const next = issuePayLink(state, true, 101);
    expect(verifyPayToken(signPayToken("a", "INV-1", state.payLinkNonce), "a", "INV-1", next, 102)).toBe(false);
  });
  it.each(["", "short"])("fails closed for missing/short secret: %s", secret => {
    vi.stubEnv("PAY_LINK_SECRET", secret);
    expect(payNowAvailability(business, invoice)).toBe(false);
    expect(() => signPayToken("a", "INV-1", "nonce")).toThrow();
  });
});
