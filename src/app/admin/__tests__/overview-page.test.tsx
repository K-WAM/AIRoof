// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AdminOverviewPage from "../page";

const DAY = 86_400_000;

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const overview = {
  month: "2026-10",
  signInsKnown: true,
  invoicesCapped: false,
  metrics: {
    monthlyRevenue: 2000, payingClients: 1, clients: 2, pausedClients: 0, collectedThisMonth: 0, unpaid: 2000, overdue: 2000,
    overdueCount: 1, costThisMonth: 210, margin: 1790, users: 3, activeUsers: 2, demoCost: 12,
  },
  attention: [{ tone: "urgent", href: "/admin/invoices?invoice=LX-1", text: "Apex Roofing: invoice LX-1 is 3 days overdue", businessId: "apex" }],
  clients: [
    { businessId: "apex", businessName: "Apex Roofing", industry: "roofing", paused: false, planName: "Suite", monthlyAmount: 2000, users: 2, activeUsers: 1,
      lastSignInAt: Date.now() - 2 * DAY, calls: 300, phoneMinutes: 1500, notes: 1000, cost: 200, margin: 1800, unpaid: 2000,
      billing: { kind: "overdue", invoiceId: "LX-1", days: 3, amount: 2000 } },
    { businessId: "new", businessName: "New Co", industry: "dental", paused: false, planName: null, monthlyAmount: null, users: 1, activeUsers: 1,
      lastSignInAt: Date.now(), calls: 0, phoneMinutes: 0, notes: 0, cost: 10, margin: null, unpaid: 0, billing: { kind: "none" } },
  ],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).startsWith("/api/admin/overview") ? respond(overview) : respond({ providers: [] }))));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Admin Overview page", () => {
  it("shows the money, what needs the owner, and one row per client with its billing link", async () => {
    render(<AdminOverviewPage />);
    expect((await screen.findByText("Apex Roofing: invoice LX-1 is 3 days overdue")).getAttribute("href")).toBe("/admin/invoices?invoice=LX-1");
    expect(within(screen.getByTestId("metric-revenue")).getByText("$2,000.00")).toBeTruthy();
    expect(screen.getByText("$2,000.00 overdue (1)")).toBeTruthy();

    const table = screen.getByTestId("overview-table");
    expect(within(table).getByRole("link", { name: /Overdue 3d/ }).getAttribute("href")).toBe("/admin/invoices?invoice=LX-1");
    expect(within(table).getByRole("link", { name: "New invoice" }).getAttribute("href")).toBe("/admin/invoices?businessId=new");
    expect(within(table).getByRole("link", { name: "Set price" }).getAttribute("href")).toBe("/admin/businesses/new/config");
    expect(within(table).getByText("2 days ago")).toBeTruthy();
    expect(screen.getByText(/Demo and test accounts cost \$12\.00 more/)).toBeTruthy();
  });

  it("says plainly when nothing needs attention", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).startsWith("/api/admin/overview") ? respond({ ...overview, attention: [] }) : respond({ providers: [] }))));
    render(<AdminOverviewPage />);
    expect(await screen.findByText("Nothing needs you right now.")).toBeTruthy();
  });

  it("shows an error with a retry instead of zeros when the overview can't load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({ error: "x" }, 500)));
    render(<AdminOverviewPage />);
    expect(await screen.findByText("The overview couldn't be loaded.")).toBeTruthy();
    expect(screen.queryByTestId("overview-table")).toBeNull();
  });
});
