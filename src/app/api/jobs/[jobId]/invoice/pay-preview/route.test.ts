import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

let db: FakeDb;
const mocks = vi.hoisted(() => ({ guard: vi.fn() }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: mocks.guard }));
vi.mock("@/lib/billing/stripePayments", () => ({ isStripeConfigured: () => false }));

import { GET } from "./route";

const companies = [
  { id: "rdsf", name: "Roof Doctors South Florida", shortName: "RDSF", isDefault: true, payInstructions: "RDSF bank" },
  { id: "rcu", name: "Roofing Concepts Unlimited", shortName: "RCU", payInstructions: "RCU bank" },
];
const req = (jobId: string, query = "businessId=biz") => new NextRequest(`https://app.test/api/jobs/${jobId}/invoice/pay-preview?${query}`);
const open = (jobId: string, query?: string) => GET(req(jobId, query), { params: Promise.resolve({ jobId }) });

beforeEach(() => {
  db = makeFakeDb();
  mocks.guard.mockReset().mockResolvedValue({ user: { uid: "owner", role: "owner" } });
  db.__seed("businesses", "biz", { businessName: "Roof Doctors", billingCompanies: companies, timezone: "America/New_York" });
  db.__seed("businesses/biz/jobs", "J-1", { jobId: "J-1", invoiceId: "INV-1", companyId: "rcu" });
  db.__seed("businesses/biz/jobs", "J-2", { jobId: "J-2", invoiceId: "INV-2" });
  db.__seed("businesses/biz/invoices", "INV-1", { invoiceId: "INV-1", businessId: "biz", jobId: "J-1", status: "sent", companyId: "rcu", total: 1200, subtotal: 1200, labor: [], materials: [], other: [], billTo: { name: "Lakeview County Schools" } });
  db.__seed("businesses/biz/invoices", "INV-2", { invoiceId: "INV-2", businessId: "biz", jobId: "J-2", status: "draft", total: 300, subtotal: 300, labor: [], materials: [], other: [], billTo: { name: "Homeowner" } });
});

describe("Pay now preview (read-only)", () => {
  it("shows the invoice's own company and switched-off buttons, with no form, token or Stripe link", async () => {
    const res = await open("J-1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("private");
    const html = await res.text();
    expect(html).toContain("Preview only.");
    expect(html).toContain("Roofing Concepts Unlimited");
    expect(html).not.toContain("Roof Doctors South Florida");
    expect(html).toContain("$1,200.00 due");
    expect(html).toMatch(/<button type="button" disabled[^>]*>Pay by card<\/button>/);
    expect(html).not.toMatch(/<form|action=|checkout\.stripe|\/api\/pay\/invoice/);
  });

  it("uses the default company for an everyday invoice and explains a draft", async () => {
    const html = await (await open("J-2")).text();
    expect(html).toContain("Roof Doctors South Florida");
    expect(html).toContain("draft — not sent yet");
    expect(html).toContain("added to the invoice email when it is sent");
  });

  it("refuses an invoice that belongs to another job, a bad id, and a denied caller", async () => {
    expect((await open("J-2", "businessId=biz&invoiceId=INV-1")).status).toBe(404);
    expect((await open("J-1", "businessId=../x")).status).toBe(404);
    mocks.guard.mockResolvedValueOnce({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await open("J-1")).status).toBe(403);
  });

  it("shows nothing to pay once the invoice is paid", async () => {
    db.__seed("businesses/biz/invoices", "INV-1", { invoiceId: "INV-1", businessId: "biz", jobId: "J-1", status: "paid", companyId: "rcu", total: 1200, amountPaid: 1200, labor: [], materials: [], other: [], billTo: { name: "Lakeview County Schools" } });
    const html = await (await open("J-1")).text();
    expect(html).toContain("Paid in full");
    expect(html).not.toContain("Pay by card");
  });
});
