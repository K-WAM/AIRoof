import { describe, expect, it } from "vitest";
import { applyPayment, applyStripeRefund, invoiceBalance } from "../customerPayments";
import type { InvoicePayment } from "@/types/invoice";

const payment: InvoicePayment = { paymentId: "stripe_pi_1", source: "stripe", amount: 100, method: "card", receivedAt: 1, recordedAt: 1, recordedBy: "stripe" };
const invoice = { total: 100, amountPaid: 100, payments: [payment], status: "paid" as const };
describe("Stripe refunds use existing payment arithmetic", () => {
  it("reopens a paid invoice and preserves gross payment + negative refund", () => {
    const result = applyStripeRefund(invoice, payment.paymentId, 30, 2)!;
    expect(result).toMatchObject({ amountPaid: 70, status: "sent" });
    expect(result.payments[1]).toMatchObject({ amount: -30, note: "Refunded online" });
    expect(invoiceBalance({ ...invoice, ...result })).toBe(30);
    expect(applyStripeRefund({ ...invoice, ...result }, payment.paymentId, 30, 3)).toBeNull();
    expect(applyStripeRefund({ ...invoice, ...result }, payment.paymentId, 10, 3)).toBeNull();
    const full = applyStripeRefund({ ...invoice, ...result }, payment.paymentId, 100, 4)!;
    expect(full.amountPaid).toBe(0);
    expect(full.payments.reduce((sum, p) => sum + p.amount, 0)).toBe(0);
  });
  it("rejects money it cannot safely attribute; preserves void; deduplicates payment ids", () => {
    expect(() => applyStripeRefund(invoice, "stripe_missing", 1, 2)).toThrow();
    expect(() => applyStripeRefund(invoice, payment.paymentId, 101, 2)).toThrow();
    expect(applyStripeRefund({ ...invoice, status: "void" }, payment.paymentId, 10, 2)?.status).toBe("void");
    expect(applyPayment(invoice, payment).payments).toHaveLength(1);
  });
  it("subtracts only the new partial refund: 30 then cumulative 50, with replays and older events ignored", () => {
    const first = { ...invoice, ...applyStripeRefund(invoice, payment.paymentId, 30, 2)! };
    const second = { ...first, ...applyStripeRefund(first, payment.paymentId, 50, 3)! };
    expect(second.amountPaid).toBe(50);
    expect(second.payments.map(p => p.amount)).toEqual([100, -30, -20]);
    expect(second.payments[0].stripeRefunded).toBe(50);
    expect(applyStripeRefund(second, payment.paymentId, 50, 4)).toBeNull();
    expect(applyStripeRefund(second, payment.paymentId, 30, 5)).toBeNull();
  });
});
