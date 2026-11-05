import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { GET, POST, PUT } from "./route";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), create: vi.fn(), retrieve: vi.fn(), link: vi.fn() }));
let db: ReturnType<typeof makeFakeDb>;
vi.mock("@/lib/auth/verifyRole", () => ({ verifyOwnBusinessRole: mocks.guard }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/billing/stripePayments", () => ({ isStripeConfigured: () => true, getStripeClient: () => ({ accounts: { create: mocks.create, retrieve: mocks.retrieve }, accountLinks: { create: mocks.link } }) }));
const request = (method: string, body?: object, query = "") => new NextRequest(`https://app.test/api/company/settings/billing/connect${query}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
beforeEach(() => {
  vi.clearAllMocks(); db = makeFakeDb();
  db.__seed("businesses", "a", { businessName: "A" });
  db.__seed("businesses", "b", { businessName: "B" });
  mocks.guard.mockResolvedValue({ user: { businessId: "a", role: "owner" } });
  mocks.create.mockResolvedValue({ id: "acct_a", charges_enabled: false });
  mocks.link.mockResolvedValue({ url: "https://connect.stripe.com/setup" });
});
describe("Connect settings", () => {
  it("refuses non-owners before accessing Stripe", async () => {
    mocks.guard.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await POST(request("POST"))).status).toBe(403);
    expect((await PUT(request("PUT", { payNow: true }))).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.guard).toHaveBeenCalledWith(expect.anything(), ["owner"]);
  });
  it("ignores body businessId, creates a Standard account once and returns only the link", async () => {
    expect(await (await POST(request("POST", { businessId: "b" }))).json()).toEqual({ url: "https://connect.stripe.com/setup" });
    await POST(request("POST"));
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith({ type: "standard", metadata: { businessId: "a" } }, { idempotencyKey: "connect-standard-a" });
    expect(db.__peek("businesses", "b")).not.toHaveProperty("stripeConnect");
  });
  it("blocks evaluation and switching on before charges are enabled", async () => {
    expect((await PUT(request("PUT", { payNow: true }))).status).toBe(409);
    db.__seed("businesses", "a", { outboundEmailAllowlist: [] });
    expect((await POST(request("POST"))).status).toBe(403);
  });
  it("never recreates an account after Stripe's idempotency window without reconciliation", async () => {
    const { Timestamp } = await import("firebase-admin/firestore");
    db.__seed("businesses/a/operations", "stripe-connect-account", { state: "pending", claimedAt: Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000) });
    expect((await POST(request("POST"))).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("refreshes on return, saves opt-in, and never exposes an account id", async () => {
    db.__seed("businesses", "a", { stripeConnect: { accountId: "acct_a" } });
    mocks.retrieve.mockResolvedValue({ id: "acct_a", charges_enabled: true, payouts_enabled: true, details_submitted: true });
    const result = await GET(request("GET", undefined, "?refresh=1"));
    expect(await result.json()).toMatchObject({ ready: true, payNow: false });
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(await (await PUT(request("PUT", { payNow: true }))).json()).toMatchObject({ payNow: true });
    expect(await (await GET(request("GET"))).text()).not.toContain("acct_a");
  });
});
