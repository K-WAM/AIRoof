import { describe, expect, it } from "vitest";
import {
  applyPayment, buildCustomerReceiptEmail, buildCustomerReminderEmail, customerReminderDue, daysPastDue,
  effectiveBillingPrefs, howToPayBlock, invoiceBalance, isSafePayLink, parseBillingPrefs, parsePayment,
} from "./customerPayments";
import type { InvoicePayment } from "@/types/invoice";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 20, 15);
const pay = (amount: number, receivedAt = NOW): InvoicePayment => ({ paymentId: `p${amount}`, amount, method: "check", receivedAt, recordedBy: "u", recordedAt: NOW });
const business = { businessName: "Acme Roofing", brandColor: "#123456" };

describe("payment settings", () => {
  it("defaults: no instructions, reminders on, due on receipt", () => {
    expect(effectiveBillingPrefs(undefined)).toEqual({ payInstructions: "", payLink: "", remindersOn: true, dueDays: 0 });
  });
  it("only accepts an https pay link on a real host", () => {
    expect(isSafePayLink("https://square.link/u/abc")).toBe(true);
    for (const bad of ["http://square.link/x", "javascript:alert(1)", "data:text/html,hi", "https://localhost", "square.link"]) expect(isSafePayLink(bad)).toBe(false);
    expect(parseBillingPrefs({ payLink: "javascript:alert(1)" })).toHaveProperty("error");
    expect(parseBillingPrefs({ payLink: "" })).toEqual({ prefs: { payLink: "" } });
  });
  it("rejects markup, overlong text and odd terms", () => {
    expect(parseBillingPrefs({ payInstructions: "<script>" })).toHaveProperty("error");
    expect(parseBillingPrefs({ payInstructions: "x".repeat(601) })).toHaveProperty("error");
    expect(parseBillingPrefs({ dueDays: 1.5 })).toHaveProperty("error");
    expect(parseBillingPrefs({ dueDays: 30, remindersOn: false, payInstructions: "  Zelle: a@b.co " })).toEqual({ prefs: { dueDays: 30, remindersOn: false, payInstructions: "Zelle: a@b.co" } });
  });
  it("a stored unsafe link is never printed", () => {
    expect(effectiveBillingPrefs({ billingPrefs: { payLink: "javascript:x" } }).payLink).toBe("");
  });
});

describe("payments", () => {
  it("adds partial payments and marks paid on the one that covers the total", () => {
    const inv = { total: 100.1, amountPaid: 0, status: "sent" as const, payments: [] };
    const first = applyPayment(inv, pay(40.05));
    expect(first).toMatchObject({ amountPaid: 40.05, status: "sent", paidInFull: false });
    const second = applyPayment({ ...inv, ...first }, pay(60.05, NOW - DAY));
    expect(second).toMatchObject({ amountPaid: 100.1, status: "paid", paidInFull: true, paidAt: NOW - DAY });
    expect(invoiceBalance({ ...inv, ...second })).toBe(0);
  });
  it("refuses zero, overpayment, future dates and unknown methods", () => {
    expect(parsePayment({ amount: 0 }, 50, NOW)).toHaveProperty("error");
    expect(parsePayment({ amount: 50.01 }, 50, NOW)).toHaveProperty("error");
    expect(parsePayment({ amount: 10, receivedAt: NOW + 2 * DAY }, 50, NOW)).toHaveProperty("error");
    expect(parsePayment({ amount: 10, method: "bitcoin" }, 50, NOW)).toHaveProperty("error");
    expect(parsePayment({ amount: "12.345", method: "zelle" }, 50, NOW)).toEqual({ payment: { amount: 12.35, method: "zelle", receivedAt: NOW } });
  });
  it("a void invoice owes nothing", () => {
    expect(invoiceBalance({ total: 10, status: "void" })).toBe(0);
  });
});

describe("overdue reminders", () => {
  const sent = { status: "sent" as const, total: 200, amountPaid: 0, dueAt: NOW - 10 * DAY };
  it("counts days late from the end of the due day, only while money is owed", () => {
    expect(daysPastDue({ ...sent, dueAt: NOW - DAY / 2 }, NOW)).toBe(0);
    expect(daysPastDue(sent, NOW)).toBe(10);
    expect(daysPastDue({ ...sent, amountPaid: 200 }, NOW)).toBe(0);
    expect(daysPastDue({ ...sent, status: "paid" }, NOW)).toBe(0);
  });
  it("sends 1, 7, 14 once each and never a skipped earlier one", () => {
    expect(customerReminderDue(sent, NOW)).toBe(7);
    expect(customerReminderDue({ ...sent, remindersSent: [7] }, NOW)).toBeNull();
    expect(customerReminderDue({ ...sent, dueAt: NOW - 20 * DAY, remindersSent: [7] }, NOW)).toBe(14);
    expect(customerReminderDue({ ...sent, dueAt: NOW - 20 * DAY, remindersSent: [14] }, NOW)).toBeNull();
    expect(customerReminderDue({ ...sent, dueAt: undefined }, NOW)).toBeNull();
  });
});

describe("emails", () => {
  it("prints How to pay with a Pay button, escaping the client's text", () => {
    const html = howToPayBlock({ payInstructions: "Zelle <pay@acme.com>", payLink: "https://pay.acme.com/x" }, 50, "#123456");
    expect(html).toContain("How to pay");
    expect(html).toContain("Zelle &lt;pay@acme.com&gt;");
    expect(html).toContain('href="https://pay.acme.com/x"');
    expect(html).toContain("Pay $50.00");
    expect(howToPayBlock({ payInstructions: "", payLink: "" }, 50)).toBe("");
  });
  it("receipt says what's left, reminder says how much and how to pay", () => {
    const receipt = buildCustomerReceiptEmail({ invoiceId: "INV-1001", billTo: { name: "Ana" }, total: 100 }, { amount: 40, method: "zelle", receivedAt: NOW }, 60, business);
    expect(receipt.subject).toContain("INV-1001");
    expect(receipt.html).toContain("$60.00 is still due");
    expect(receipt.html).toContain("Acme Roofing");
    const reminder = buildCustomerReminderEmail({ invoiceId: "INV-1001", billTo: { name: "Ana" }, dueAt: NOW - 15 * DAY }, 60, 15, business, { payInstructions: "Checks to Acme", payLink: "" });
    expect(reminder.subject).toMatch(/^\[Final reminder\]/);
    expect(reminder.html).toContain("$60.00");
    expect(reminder.html).toContain("Checks to Acme");
  });
});
