import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { POST } from "./route";
import type Stripe from "stripe";

const mocks = vi.hoisted(() => ({ construct: vi.fn(), email: vi.fn(), retrieve: vi.fn(), unavailable: false }));
let db: ReturnType<typeof makeFakeDb>;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => mocks.unavailable ? null : db }));
vi.mock("@/lib/billing/stripePayments", () => ({ getStripeClient: () => ({ webhooks: { constructEvent: mocks.construct }, paymentIntents: { retrieve: mocks.retrieve } }) }));
vi.mock("@/lib/comms/send", () => ({ sendEmail: mocks.email }));
vi.mock("next/server", async importOriginal => ({ ...await importOriginal<typeof import("next/server")>(), after: (work: () => Promise<void>) => { void work(); } }));
const metadata = { businessId: "a", invoiceId: "INV-1", jobId: "job1", tokenHashPrefix: "abcdef12" };
const session = { id: "cs_1", mode: "payment", payment_intent: "pi_1", payment_status: "paid", amount_total: 10000, currency: "usd", payment_method_types: ["card"], metadata };
const event = (type = "checkout.session.completed", object: object = session, id = "evt_1", account = "acct_a") => ({ id, type, account, created: 100, data: { object } }) as Stripe.Event;
const invoice = () => db.__peek("businesses/a/invoices", "INV-1")!;
async function post(evt: Stripe.Event) {
  mocks.construct.mockReturnValue(evt);
  return POST(new NextRequest("https://app.test/api/webhooks/stripe-connect", { method: "POST", body: "raw bytes", headers: { "stripe-signature": "signed" } }));
}
beforeEach(() => {
  mocks.unavailable = false; vi.clearAllMocks(); vi.stubEnv("STRIPE_SECRET_KEY", "test-only"); vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "test-only-secret");
  db = makeFakeDb();
  db.__seed("businesses", "a", { businessName: "A", stripeConnect: { accountId: "acct_a", chargesEnabled: true } });
  db.__seed("businesses/a/invoices", "INV-1", { businessId: "a", invoiceId: "INV-1", jobId: "job1", total: 100, status: "sent", billTo: { name: "Customer", email: "c@example.test" } });
  db.__seed("businesses/a/jobs", "job1", { invoiceId: "INV-1", status: "invoiced" });
  mocks.email.mockResolvedValue({ status: "delivered" });
});
afterEach(() => vi.unstubAllEnvs());
describe("Connect webhook authentication and tenant boundaries", () => {
  it("missing secret is 503 and bad signature is 400, with no database effect", async () => {
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "");
    expect((await post(event())).status).toBe(503); expect(mocks.construct).not.toHaveBeenCalled();
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "test-only-secret");
    mocks.construct.mockImplementationOnce(() => { throw new Error("bad signature"); });
    expect((await post(event())).status).toBe(400);
    expect(invoice()).not.toHaveProperty("payments");
  });
  it("constructEvent gets the exact raw body and signature", async () => {
    await post(event());
    expect(mocks.construct).toHaveBeenCalledWith("raw bytes", "signed", "test-only-secret");
  });
  it("ignores the wrong account and an invoice claiming another tenant", async () => {
    expect((await post(event(undefined, undefined, "evt_wrong", "acct_wrong"))).status).toBe(200);
    db.__seed("businesses/a/invoices", "INV-1", { ...invoice(), businessId: "b" });
    expect((await post(event())).status).toBe(200);
    expect(invoice()).not.toHaveProperty("payments");
    expect(db.__list("businesses/a/stripeUnmatched")).toHaveLength(1);
  });
});
describe("Connect money and event idempotency", () => {
  it("acknowledges the event without waiting for a slow receipt provider", async () => {
    mocks.email.mockImplementationOnce(() => new Promise(() => {}));
    expect((await post(event())).status).toBe(200);
    expect(invoice().amountPaid).toBe(100);
  });
  it("records paid card once, completes the job and sends the guarded tenant receipt", async () => {
    expect((await post(event())).status).toBe(200);
    expect(invoice()).toMatchObject({ amountPaid: 100, status: "paid", payments: [{ paymentId: "stripe_pi_1", source: "stripe", amount: 100 }] });
    expect(db.__peek("businesses/a/jobs", "job1")).toMatchObject({ status: "complete" });
    expect(mocks.email).toHaveBeenCalledWith(expect.objectContaining({ businessId: "a", to: "c@example.test" }));
    await post(event());
    await post(event("checkout.session.async_payment_succeeded", session, "evt_duplicate"));
    expect(invoice().payments).toHaveLength(1); expect(mocks.email).toHaveBeenCalledTimes(1);
    expect(db.__list("businesses/a/operations")).toHaveLength(2);
  });
  it("serializes concurrent duplicate events and distinct events for the same payment", async () => {
    await Promise.all([post(event()), post(event()), post(event("checkout.session.completed", session, "evt_2"))]);
    expect(invoice().payments).toHaveLength(1);
  });
  it("ACH pending records no money, success records once, and a late pending event stays terminal", async () => {
    const bank = { ...session, payment_status: "unpaid", payment_method_types: ["us_bank_account"] };
    await post(event("checkout.session.completed", bank));
    expect(invoice()).toHaveProperty("payNowPending.sessionId", "cs_1"); expect(invoice()).not.toHaveProperty("payments");
    await post(event("checkout.session.async_payment_succeeded", { ...bank, payment_status: "paid" }, "evt_success"));
    expect(invoice()).toMatchObject({ amountPaid: 100, payments: [{ method: "bank" }] });
    expect(invoice()).not.toHaveProperty("payNowPending");
    await post(event("checkout.session.completed", bank, "evt_late"));
    expect(invoice()).not.toHaveProperty("payNowPending");
  });
  it("ACH failure clears pending and records only a ledger note; late completed stays failed", async () => {
    const bank = { ...session, payment_status: "unpaid", payment_method_types: ["us_bank_account"] };
    await post(event("checkout.session.completed", bank));
    await post(event("checkout.session.async_payment_failed", bank, "evt_failed"));
    expect(invoice()).not.toHaveProperty("payNowPending"); expect(invoice()).not.toHaveProperty("payments");
    expect(db.__peek("businesses/a/operations", "stripe:evt_failed")).toHaveProperty("note", "ach-failed");
    await post(event("checkout.session.completed", bank, "evt_late"));
    expect(invoice()).not.toHaveProperty("payNowPending");
  });
  it("records and flags overpayments even after Pay now is switched off", async () => {
    await post(event("checkout.session.completed", { ...session, amount_total: 12000 }));
    expect(invoice()).toMatchObject({ amountPaid: 120, status: "paid" });
    expect(invoice().payNowNotice).toMatch(/overpayment/);
  });
  it("refund reduces the balance through negative payments, reopens and ignores cumulative replays", async () => {
    await post(event());
    const charge = { id: "ch_1", payment_intent: "pi_1", currency: "usd", amount_refunded: 3000, metadata };
    await post(event("charge.refunded", charge, "evt_refund"));
    expect(invoice()).toMatchObject({ amountPaid: 70, status: "sent" });
    expect(invoice()).not.toHaveProperty("paidAt");
    expect(db.__peek("businesses/a/jobs", "job1")).toMatchObject({ status: "invoiced" });
    expect(db.__peek("businesses/a/jobs", "job1")).not.toHaveProperty("paymentReceivedAt");
    await post(event("charge.refunded", charge, "evt_refund_again"));
    expect(invoice().payments).toHaveLength(2);
    await post(event("charge.refunded", { ...charge, amount_refunded: 10000 }, "evt_full_refund"));
    expect(invoice()).toMatchObject({ amountPaid: 0, status: "sent" });
  });
  it("looks up refund metadata on the direct account and retries refunds delivered before payment", async () => {
    mocks.retrieve.mockResolvedValue({ metadata });
    const charge = { id: "ch_1", payment_intent: "pi_1", currency: "usd", amount_refunded: 3000, metadata: {} };
    expect((await post(event("charge.refunded", charge, "evt_refund"))).status).toBe(500);
    await post(event());
    expect((await post(event("charge.refunded", charge, "evt_refund"))).status).toBe(200);
    expect(mocks.retrieve).toHaveBeenCalledWith("pi_1", {}, { stripeAccount: "acct_a" });
    expect(invoice().amountPaid).toBe(70);
  });
  it("account.updated refreshes stored flags, refuses wrong account, and ignores older events", async () => {
    const account = { id: "acct_a", metadata: { businessId: "a" }, charges_enabled: false, payouts_enabled: false, details_submitted: true };
    await post(event("account.updated", account));
    expect(db.__peek("businesses", "a")).toHaveProperty("stripeConnect.chargesEnabled", false);
    // A Settings status refresh replaces only the flags object; its separate event watermark must survive.
    await db.collection("businesses").doc("a").update({ stripeConnect: { accountId: "acct_a", chargesEnabled: false } });
    await post({ ...event("account.updated", { ...account, charges_enabled: true }, "evt_old"), created: 99 });
    expect(db.__peek("businesses", "a")).toHaveProperty("stripeConnect.chargesEnabled", false);
    await post(event("account.updated", { ...account, id: "acct_other", charges_enabled: true }, "evt_wrong", "acct_other"));
    expect(db.__peek("businesses", "a")).toHaveProperty("stripeConnect.chargesEnabled", false);
  });
});

describe("verified event recovery", () => {
  it.each(["invoice", "job", "foreign job", "missing metadata", "foreign metadata"])("stores an unmatched record once: %s", async reason => {
    if (reason === "invoice") await db.collection("businesses/a/invoices").doc("INV-1").delete();
    if (reason === "job") await db.collection("businesses/a/jobs").doc("job1").delete();
    if (reason === "foreign job") await db.collection("businesses/a/jobs").doc("job1").update({ businessId: "b" });
    const payload = { ...session, metadata: reason === "missing metadata" ? {} : reason === "foreign metadata" ? { ...metadata, businessId: "b" } : metadata, customer_email: "DO-NOT-STORE@example.test" };
    expect((await post(event(undefined, payload))).status).toBe(200);
    const record = db.__peek("businesses/a/stripeUnmatched", "pay_pi_1");
    expect(record).toMatchObject({ kind: "payment", eventType: "checkout.session.completed", sessionId: "cs_1", paymentIntentId: "pi_1", amount: 100, currency: "usd", receivedAt: expect.any(Number), reason: expect.any(String) });
    expect(JSON.stringify(record)).not.toContain("DO-NOT-STORE");
    expect(invoice()?.payments).toBeUndefined();
    await post(event(undefined, payload));
    expect(db.__list("businesses/a/stripeUnmatched")).toHaveLength(1);
    expect(db.__peek("businesses/a/stripeUnmatched", "pay_pi_1")).toEqual(record);
  });
  it.each(["checkout.session.completed", "checkout.session.async_payment_failed"])("unmatched ACH with no money leaves only a ledger note: %s", async type => {
    await db.collection("businesses/a/invoices").doc("INV-1").delete();
    const bank = { ...session, payment_status: "unpaid", payment_method_types: ["us_bank_account"] };
    expect((await post(event(type, bank))).status).toBe(200);
    expect(db.__list("businesses/a/stripeUnmatched")).toHaveLength(0);
    expect(db.__peek("businesses/a/operations", "stripe:evt_1")).toMatchObject({ state: "succeeded", note: "unmatched-online-event-no-money" });
    expect(mocks.email).not.toHaveBeenCalled();
  });
  it.each([false, true])("collapses completed-paid and async-succeeded for an unmatched intent (success first: %s)", async successFirst => {
    await db.collection("businesses/a/invoices").doc("INV-1").delete();
    const events = [event(), event("checkout.session.async_payment_succeeded", session, "evt_success")];
    if (successFirst) events.reverse();
    await post(events[0]);
    const record = db.__peek("businesses/a/stripeUnmatched", "pay_pi_1");
    await post(events[1]);
    expect(db.__list("businesses/a/stripeUnmatched")).toHaveLength(1);
    expect(db.__peek("businesses/a/stripeUnmatched", "pay_pi_1")).toEqual(record);
    expect(record).toMatchObject({ kind: "payment", amount: 100, paymentIntentId: "pi_1" });
    expect(db.__list("businesses/a/operations")).toHaveLength(2);
  });
  it("records an unmatched refund separately and collapses repeated cumulative amounts", async () => {
    await db.collection("businesses/a/invoices").doc("INV-1").delete();
    const charge = { id: "ch_1", payment_intent: "pi_1", currency: "usd", amount_refunded: 3000, metadata };
    await post(event("charge.refunded", charge, "evt_refund"));
    const record = db.__peek("businesses/a/stripeUnmatched", "refund_ch_1_3000");
    expect(record).toMatchObject({ kind: "refund", amount: 30, chargeId: "ch_1", paymentIntentId: "pi_1" });
    await post(event("charge.refunded", charge, "evt_refund_duplicate"));
    expect(db.__list("businesses/a/stripeUnmatched")).toHaveLength(1);
    expect(db.__peek("businesses/a/stripeUnmatched", "refund_ch_1_3000")).toEqual(record);
  });
  it("returns 500 for a failed money transaction, leaves the claim pending, and replays exactly once", async () => {
    const run = db.runTransaction.bind(db);
    let calls = 0;
    const spy = vi.spyOn(db, "runTransaction").mockImplementation(async callback => {
      if (++calls === 2) throw new Error("Firestore unavailable");
      return run(callback);
    });
    expect((await post(event())).status).toBe(500);
    expect(db.__peek("businesses/a/operations", "stripe:evt_1")).toHaveProperty("state", "pending");
    expect(invoice().payments).toBeUndefined();
    spy.mockRestore();
    expect((await post(event())).status).toBe(200);
    await post(event());
    expect(invoice().payments).toHaveLength(1);
    expect(db.__peek("businesses/a/operations", "stripe:evt_1")).toHaveProperty("state", "succeeded");
  });
  it("does not write anything or retrieve Stripe objects for an unknown account", async () => {
    expect((await post(event("charge.refunded", { id: "ch_1", payment_intent: "pi_1", metadata: {} }, "evt_foreign", "acct_foreign"))).status).toBe(200);
    expect(db.__list("businesses/a/stripeUnmatched")).toHaveLength(0);
    expect(db.__list("businesses/a/operations")).toHaveLength(0);
    expect(invoice().payments).toBeUndefined();
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });
});

it("returns 500 when Firestore is unavailable after signature verification", async () => {
  mocks.unavailable = true;
  expect((await post(event())).status).toBe(500);
  mocks.unavailable = false;
  expect(db.__list("businesses/a/operations")).toHaveLength(0);
  expect((await post(event())).status).toBe(200);
  expect(invoice().payments).toHaveLength(1);
});
