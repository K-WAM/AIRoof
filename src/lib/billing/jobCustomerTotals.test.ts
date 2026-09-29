import { describe, expect, it } from "vitest";
import { customerTotals, validCustomerSubtotal } from "./jobCustomerTotals";

const invoice = {
  labor: [{ lineId: "l", name: "Work", hours: 1, rate: 75, total: 75, source: "manual" as const }],
  materials: [{ lineId: "m", item: "Part", quantity: 1, unitPrice: 25, total: 25, source: "manual" as const }],
  other: [], taxRate: 7.5, discount: { kind: "amount" as const, value: 10 },
};

describe("customerTotals", () => {
  it("keeps the line sum for itemized and both bundle presentations", () => {
    expect(customerTotals({ kind: "invoice", invoice })).toMatchObject({ calculatedSubtotal: 100, subtotal: 90, taxAmount: 6.75, total: 96.75 });
    expect(customerTotals({ kind: "quote", lineSubtotal: 100.005 })).toMatchObject({ calculatedSubtotal: 100.01, subtotal: 100.01, total: 100.01 });
  });

  it("makes a typed project price the one customer subtotal and ignores invoice discount", () => {
    expect(customerTotals({ kind: "quote", lineSubtotal: 100, priceMode: "project", customerSubtotal: 130 })).toMatchObject({ calculatedSubtotal: 100, subtotal: 130, total: 130 });
    expect(customerTotals({ kind: "invoice", invoice, priceMode: "project", customerSubtotal: 130.25 })).toMatchObject({ calculatedSubtotal: 100, subtotal: 130.25, taxAmount: 9.77, total: 140.02 });
  });

  it("rejects nonfinite, negative, excessive and sub-cent project prices", () => {
    for (const value of [NaN, Infinity, -1, 10_000_000.01, 1.001, "20"]) expect(validCustomerSubtotal(value)).toBe(false);
    expect(validCustomerSubtotal(0)).toBe(true);
    expect(validCustomerSubtotal(0.29)).toBe(true);
    expect(() => customerTotals({ kind: "quote", lineSubtotal: 5, priceMode: "project" })).toThrow();
  });
});
