import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { issuePayLink, verifyPayToken } from "@/lib/billing/payNowToken";
import { GET } from "./route";
import { GET as unmatched } from "@/app/api/company/billing/unmatched/route";
import { productForApiPath } from "@/lib/products/products";

let db: ReturnType<typeof makeFakeDb>;
vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: () => db,
  verifyIdToken: async (token: string) => token === "missing" ? null : { uid: token, email: `${token}@example.test`, auth_time: 1, superadmin: token === "admin" },
  confirmSuperadminClaim: async () => true,
}));
vi.mock("@/lib/billing/stripePayments", () => ({ isStripeConfigured: () => true }));
beforeEach(() => {
  vi.stubEnv("PAY_LINK_SECRET", "test-only-pay-link-secret-32-characters");
  vi.stubEnv("STRIPE_SECRET_KEY", "test-only");
  db = makeFakeDb();
  db.__seed("businesses", "a", { businessName: "A", billingPrefs: { payNow: true }, stripeConnect: { accountId: "acct_a", chargesEnabled: true } });
  for (const role of ["owner", "staff", "viewer", "crew"]) db.__seed("businessUsers", role, { uid: role, businessId: "a", role, active: true });
  db.__seed("businessUsers", "foreign", { uid: "foreign", businessId: "b", role: "owner", active: true });
  db.__seed("businesses/a/jobs", "j", { invoiceId: "INV-1" });
  db.__seed("businesses/a/invoices", "INV-1", { invoiceId: "INV-1", jobId: "j", businessId: "a", total: 100, status: "sent", ...issuePayLink({}) });
  db.__seed("businesses/a/stripeUnmatched", "pay_pi_1", { kind: "payment", eventType: "checkout.session.completed", amount: 12, currency: "usd", sessionId: "cs_1", receivedAt: 1 });
});
afterEach(() => vi.unstubAllEnvs());
const request = (role: string, path = "/api/jobs/j/invoice/pay-link", businessId = "a") => new NextRequest(`https://app.test${path}?businessId=${businessId}&invoiceId=INV-1`, { headers: { cookie: `__session=${role}` } });
const context = { params: Promise.resolve({ jobId: "j" }) };

it.each(["missing", "viewer", "crew", "foreign", "admin"])("refuses %s through the real central guard", async role => {
  const before = db.__peek("businesses/a/invoices", "INV-1");
  expect((await GET(request(role), context)).status).toBe(role === "missing" ? 401 : 403);
  expect((await unmatched(request(role, "/api/company/billing/unmatched"))).status).toBe(role === "missing" ? 401 : 403);
  expect(db.__peek("businesses/a/invoices", "INV-1")).toEqual(before);
});
it.each(["owner", "staff"])("recovers a link and unmatched references for %s without writes", async role => {
  const before = db.__peek("businesses/a/invoices", "INV-1")!;
  const response = await GET(request(role), context);
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json();
  expect(Object.keys(body).sort()).toEqual(["expiresAt", "url"]);
  expect(verifyPayToken(new URL(body.url).searchParams.get("t")!, "a", "INV-1", before)).toBe(true);
  expect(db.__peek("businesses/a/invoices", "INV-1")).toEqual(before);
  const office = await unmatched(request(role, "/api/company/billing/unmatched"));
  expect(office.headers.get("cache-control")).toBe("private, no-cache");
  expect(await office.json()).toMatchObject({ count: 1, paymentCount: 1, refundCount: 0, payments: [{ eventId: "pay_pi_1", kind: "payment", amount: 12, sessionId: "cs_1" }] });
});
it.each(["nonce missing", "expired", "draft", "paid", "void", "off", "secret missing", "foreign invoice", "foreign job", "wrong job"])("404 without creating a nonce when %s", async reason => {
  const inv = db.__peek("businesses/a/invoices", "INV-1")!;
  if (reason === "nonce missing") { delete inv.payLinkNonce; delete inv.payLinkExpiresAt; }
  if (reason === "expired") inv.payLinkExpiresAt = 1;
  if (reason === "draft" || reason === "paid" || reason === "void") inv.status = reason;
  if (reason === "off") await db.collection("businesses").doc("a").update({ billingPrefs: { payNow: false } });
  if (reason === "secret missing") vi.stubEnv("PAY_LINK_SECRET", "");
  if (reason === "foreign invoice") inv.businessId = "b";
  if (reason === "foreign job") await db.collection("businesses/a/jobs").doc("j").update({ businessId: "b" });
  if (reason === "wrong job") inv.jobId = "other";
  db.__seed("businesses/a/invoices", "INV-1", inv);
  expect((await GET(request("owner"), context)).status).toBe(404);
  expect(db.__peek("businesses/a/invoices", "INV-1")).toEqual(inv);
});
it("rejects a caller asking for another tenant and keeps product routes in billing", async () => {
  expect((await GET(request("owner", undefined, "b"), context)).status).toBe(403);
  expect((await unmatched(request("owner", "/api/company/billing/unmatched", "b"))).status).toBe(403);
  expect(productForApiPath("/api/jobs/j/invoice/pay-link")).toBe("billing");
  expect(productForApiPath("/api/company/billing/unmatched")).toBe("billing");
});
it("returns separate total payment/refund counts beyond the bounded reference list", async () => {
  for (let i = 2; i <= 35; i++) db.__seed("businesses/a/stripeUnmatched", `pay_pi_${i}`, { kind: "payment", amount: 10, currency: "usd", receivedAt: i });
  db.__seed("businesses/a/stripeUnmatched", "refund_ch_1_3000", { kind: "refund", amount: 30, currency: "usd", chargeId: "ch_1", receivedAt: 40 });
  const data = await (await unmatched(request("owner", "/api/company/billing/unmatched"))).json();
  expect(data).toMatchObject({ count: 36, paymentCount: 35, refundCount: 1 });
  expect(data.payments).toHaveLength(30);
  expect(data.payments[0]).toMatchObject({ eventId: "refund_ch_1_3000", kind: "refund", amount: 30 });
});
