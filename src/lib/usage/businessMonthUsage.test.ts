import { describe, expect, it } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { monthRange, readBusinessCompanyActivity } from "./businessMonthUsage";

const OCT = monthRange("2026-10")!;
const NOV = monthRange("2026-11")!;
const oct20 = Date.UTC(2026, 9, 20);
const nov3 = Date.UTC(2026, 10, 3);
const nov5 = Date.UTC(2026, 10, 5);

function dbWithPayments() {
  const db = makeFakeDb();
  // Created in October, paid in November: its money belongs to November.
  db.__seed("businesses/biz/invoices", "INV-OCT", {
    companyId: "rcu", status: "paid", total: 500, amountPaid: 500,
    createdAt: oct20, updatedAt: nov5, paidAt: nov5,
    payments: [{ receivedAt: nov5, amount: 500 }],
  });
  // Created in November: its total is November's invoiced money.
  db.__seed("businesses/biz/invoices", "INV-NOV", {
    companyId: "rdsf", status: "sent", total: 300,
    createdAt: nov3, updatedAt: nov3,
    payments: [{ receivedAt: nov3, amount: 100 }],
  });
  return db;
}

const activity = (db: ReturnType<typeof makeFakeDb>, range: { from: number; to: number }) =>
  readBusinessCompanyActivity(db as never, "biz", range);

describe("readBusinessCompanyActivity collected money (T-317 fix)", () => {
  it("counts an October invoice's payment in November", async () => {
    const invoices = (await activity(dbWithPayments(), NOV)).invoices;
    expect(invoices.find((row) => row.companyId === "rcu")).toEqual({ companyId: "rcu", total: 0, collected: 500 });
  });

  it("does not count that payment in October, where the invoice was created", async () => {
    const invoices = (await activity(dbWithPayments(), OCT)).invoices;
    expect(invoices.find((row) => row.companyId === "rcu")).toEqual({ companyId: "rcu", total: 500, collected: 0 });
  });

  it("keeps an invoice created this month's total and only its this-month payments", async () => {
    const invoices = (await activity(dbWithPayments(), NOV)).invoices;
    expect(invoices.find((row) => row.companyId === "rdsf")).toEqual({ companyId: "rdsf", total: 300, collected: 100 });
  });
});
