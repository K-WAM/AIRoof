import { expect, it } from "vitest";
import { depositAmount, withInvoiceDeposits } from "./jobInvoiceDeposits";
import { invoiceBalance } from "./customerPayments";
import type { JobInvoice } from "@/types/invoice";
import { computeTotals } from "@/app/company/jobs/[jobId]/jobInvoice";
const lines = { labor: [], materials: [], other: [{ lineId: "work", description: "Service", amount: 8000 }], taxRate: 0 };
const final: JobInvoice = { invoiceId: "INV-1", businessId: "b", jobId: "j", status: "draft", billTo: { name: "Customer" }, hideMaterials: false, createdAt: 1, updatedAt: 1, createdBy: "u", ...lines, ...computeTotals(lines) };
const deposit = (id: string, total: number, status: JobInvoice["status"] = "sent") => ({ ...final, kind: "deposit" as const, invoiceId: id, total, status });
it.each([-1, 0, 101, NaN])("rejects invalid deposit percentage %s", percent => expect(() => depositAmount(8000, percent)).toThrow());
it("requests 50% of 8000 and rounds 33% of 1000.01 to cents", () => { expect(depositAmount(8000, 50)).toBe(4000); expect(depositAmount(1000.01, 33)).toBe(330); });
it("deposit plus final equals contract and two deposits subtract after tax", () => {
  const result = withInvoiceDeposits(final, [deposit("D-1", 4000)]);
  expect(result.total + 4000).toBe(8000);
  const taxed = withInvoiceDeposits({ ...final, taxRate: 10 }, [deposit("D-1", 4000), deposit("D-2", 1000)]);
  expect(taxed.taxAmount).toBe(800);
  expect(taxed.total).toBe(3800);
  expect(taxed.depositsApplied).toEqual([{ invoiceId: "D-1", amount: 4000 }, { invoiceId: "D-2", amount: 1000 }]);
});
it("uses project price and never reduces the final below zero", () => {
  expect(withInvoiceDeposits({ ...final, priceMode: "project", customerSubtotal: 1000.01 }, [deposit("D", 330)]).total).toBe(670.01);
  expect(withInvoiceDeposits(final, [deposit("D", 9000)]).total).toBe(0);
});
it("ignores drafts, voids and other jobs, restores voided credits, leaves sent finals immutable", () => {
  const billed = withInvoiceDeposits(final, [deposit("D", 4000)]);
  expect(withInvoiceDeposits(billed, [deposit("D", 4000, "void")]).total).toBe(8000);
  expect(withInvoiceDeposits(final, [deposit("D", 4000, "draft"), { ...deposit("E", 1000), jobId: "other" }]).total).toBe(8000);
  expect(withInvoiceDeposits({ ...billed, status: "sent" }, [deposit("D", 4000, "void")]).total).toBe(4000);
});
it("a payment on a deposit never changes the final balance", () => {
  const before = withInvoiceDeposits(final, [deposit("D", 4000)]);
  const after = withInvoiceDeposits(final, [{ ...deposit("D", 4000, "paid"), amountPaid: 4000 }]);
  expect(after.total).toBe(before.total);
  expect(invoiceBalance({ ...after, status: "sent" })).toBe(4000);
});
it("a send lock left behind by a killed request expires after 10 minutes", async () => {
  const { sendLockActive, SEND_LOCK_STALE_MS } = await import("./jobInvoiceStore");
  const now = 1_000_000_000;
  expect(sendLockActive(undefined, now)).toBe(false);
  expect(sendLockActive({ at: now - 1000 }, now)).toBe(true);
  expect(sendLockActive({ at: now - SEND_LOCK_STALE_MS - 1 }, now)).toBe(false);
  expect(sendLockActive({} as { at?: number }, now)).toBe(true);
});
