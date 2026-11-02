import { describe, expect, it } from "vitest";
import { billingStateFor, buildOverview, sinceLabel, type OverviewClientInput, type OverviewInvoiceInput } from "@/lib/admin/overview";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-31T15:00:00Z");
const RANGE = { from: Date.UTC(2026, 9, 1), to: Date.UTC(2026, 10, 1) };

function client(over: Partial<OverviewClientInput> = {}): OverviewClientInput {
  return {
    businessId: "apex",
    businessName: "Apex Roofing",
    industry: "roofing",
    purpose: "client",
    paused: false,
    planName: "Suite",
    monthlyAmount: 2000,
    autoInvoice: false,
    members: [{ active: true, lastSignInAt: NOW - 2 * DAY }, { active: true, lastSignInAt: null }],
    calls: 300,
    phoneMinutes: 1500,
    notes: 1000,
    cost: 196.4,
    phoneLineReady: true,
    bookingCheckFailed: false,
    createdAt: NOW - 90 * DAY,
    ...over,
  };
}

const inv = (over: Partial<OverviewInvoiceInput>): OverviewInvoiceInput => ({ invoiceId: "LX-1", businessId: "apex", total: 2000, status: "sent", dueDate: "2026-11-15", createdAt: NOW - DAY, ...over });

describe("billingStateFor", () => {
  it("an overdue invoice wins over everything, worst first", () => {
    const { billing, unpaid } = billingStateFor([
      inv({ invoiceId: "LX-1", dueDate: "2026-10-25" }),
      inv({ invoiceId: "LX-2", dueDate: "2026-10-01" }),
      inv({ invoiceId: "LX-3", status: "draft" }),
    ], NOW);
    expect(billing).toMatchObject({ kind: "overdue", invoiceId: "LX-2" });
    expect(unpaid).toBe(4000);
  });

  it("sent and not yet due → due; only a draft → draft; only paid → the latest paid; nothing → none", () => {
    expect(billingStateFor([inv({})], NOW).billing).toMatchObject({ kind: "due", dueDate: "2026-11-15" });
    expect(billingStateFor([inv({ status: "draft" })], NOW).billing).toMatchObject({ kind: "draft" });
    expect(billingStateFor([inv({ invoiceId: "A", status: "paid", paidAt: NOW - 40 * DAY }), inv({ invoiceId: "B", status: "paid", paidAt: NOW - DAY })], NOW).billing)
      .toMatchObject({ kind: "paid", invoiceId: "B" });
    expect(billingStateFor([], NOW)).toEqual({ billing: { kind: "none" }, unpaid: 0 });
  });
});

describe("buildOverview", () => {
  it("money: revenue = live plan prices, collected = paid this month, unpaid/overdue = sent, margin = revenue − cost", () => {
    const o = buildOverview(
      [client(), client({ businessId: "b2", businessName: "Bravo", monthlyAmount: 500, paused: true, cost: 10 })],
      [
        inv({ invoiceId: "LX-1", status: "paid", paidAt: NOW - 3 * DAY, total: 2000 }),
        inv({ invoiceId: "LX-0", status: "paid", paidAt: Date.UTC(2026, 8, 20), total: 2000 }), // September: not this month
        inv({ invoiceId: "LX-2", businessId: "b2", total: 500, dueDate: "2026-10-10" }),
      ],
      "2026-10", RANGE, NOW,
    );
    expect(o.metrics).toMatchObject({
      monthlyRevenue: 2000, payingClients: 1, clients: 2, pausedClients: 1,
      collectedThisMonth: 2000, unpaid: 500, overdue: 500, overdueCount: 1,
      costThisMonth: 206.4, margin: 1793.6, users: 4, activeUsers: 2,
    });
    expect(o.clients[0]).toMatchObject({ businessId: "apex", margin: 1803.6, users: 2, activeUsers: 1, lastSignInAt: NOW - 2 * DAY });
  });

  it("demo/test accounts are kept out of the client list and totals; archived are dropped", () => {
    const o = buildOverview(
      [client(), client({ businessId: "demo-roofing", purpose: "demo", cost: 25 }), client({ businessId: "old", purpose: "archived", cost: 99 })],
      [], "2026-10", RANGE, NOW,
    );
    expect(o.clients.map((c) => c.businessId)).toEqual(["apex"]);
    expect(o.metrics.costThisMonth).toBe(196.4);
    expect(o.metrics.demoCost).toBe(25);
  });

  it("Needs you: overdue and draft invoices open that invoice; missing price, no line, failed check and quiet accounts link to the client", () => {
    const o = buildOverview(
      [
        client({ businessId: "late", businessName: "Late Co" }),
        client({ businessId: "draft", businessName: "Draft Co" }),
        client({ businessId: "noprice", businessName: "NoPrice Co", monthlyAmount: null }),
        client({ businessId: "noline", businessName: "NoLine Co", phoneLineReady: false }),
        client({ businessId: "check", businessName: "Check Co", bookingCheckFailed: true }),
        client({ businessId: "quiet", businessName: "Quiet Co", members: [{ active: true, lastSignInAt: NOW - 20 * DAY }] }),
        client({ businessId: "never", businessName: "Never Co", members: [{ active: true, lastSignInAt: null }] }),
        client({ businessId: "new", businessName: "New Co", members: [{ active: true, lastSignInAt: null }], createdAt: NOW - 3 * DAY }),
      ],
      [
        inv({ invoiceId: "LX-9", businessId: "late", dueDate: "2026-10-20" }),
        inv({ invoiceId: "LX-8", businessId: "draft", status: "draft" }),
        inv({ invoiceId: "LX-7", businessId: undefined, clientName: "Walk-up LLC", dueDate: "2026-10-01" }),
      ],
      "2026-10", RANGE, NOW,
    );
    const texts = o.attention.map((a) => a.text);
    expect(texts).toEqual(expect.arrayContaining([
      "Late Co: invoice LX-9 is 11 days overdue",
      "Draft Co: invoice LX-8 is a draft — check it and send it",
      "NoPrice Co has no monthly price — set it under Plan",
      "NoLine Co has no working phone line",
      "Check Co: today's booking check failed",
      "Nobody at Quiet Co has signed in for 20 days",
      "Nobody at Never Co has signed in yet",
      "Walk-up LLC: invoice LX-7 is 30 days overdue",
    ]));
    expect(texts.some((t) => t.includes("New Co"))).toBe(false); // too new to call quiet
    expect(o.attention.find((a) => a.text.startsWith("Late Co"))?.href).toBe("/admin/invoices?invoice=LX-9");
    expect(o.attention.find((a) => a.text.startsWith("NoLine"))?.href).toBe("/admin/businesses/noline/config");
    // Urgent first.
    const firstWarn = o.attention.findIndex((a) => a.tone === "warn");
    expect(o.attention.slice(firstWarn).every((a) => a.tone === "warn")).toBe(true);
  });

  it("a paused client only raises money items, and missing sign-in data raises no quiet warnings", () => {
    const paused = buildOverview([client({ paused: true, phoneLineReady: false, monthlyAmount: null })], [], "2026-10", RANGE, NOW);
    expect(paused.attention).toEqual([]);
    const unknown = buildOverview([client({ members: [{ active: true, lastSignInAt: null }] })], [], "2026-10", RANGE, NOW, false);
    expect(unknown.attention).toEqual([]);
  });

  it("an unclassified account counts as a client but isn't nagged for a price", () => {
    const o = buildOverview([client({ purpose: "unclassified", monthlyAmount: null })], [], "2026-10", RANGE, NOW);
    expect(o.clients).toHaveLength(1);
    expect(o.attention).toEqual([]);
  });

  it("disabled team members are not counted as users", () => {
    const o = buildOverview([client({ members: [{ active: false, lastSignInAt: NOW }, { active: true, lastSignInAt: NOW - DAY }] })], [], "2026-10", RANGE, NOW);
    expect(o.clients[0]).toMatchObject({ users: 1, activeUsers: 1 });
  });
});

describe("sinceLabel", () => {
  it("reads like a person would say it", () => {
    expect(sinceLabel(null, NOW)).toBe("Never");
    expect(sinceLabel(NOW - 60_000, NOW)).toBe("Today");
    expect(sinceLabel(NOW - DAY - 1, NOW)).toBe("Yesterday");
    expect(sinceLabel(NOW - 9 * DAY, NOW)).toBe("9 days ago");
  });
});
