import { describe, expect, it } from "vitest";
import { buildLuxorReceiptEmail, buildLuxorReminderEmail, daysOverdue, reminderDue } from "./luxorNotices";

const at = (iso: string) => Date.parse(iso);
const inv = (over: Record<string, unknown> = {}) => ({ invoiceId: "LX-1001", clientName: "Apex <Roofing>", total: 299, dueDate: "2026-10-01", status: "sent" as const, ...over });

describe("Luxor billing notices", () => {
  it("counts days overdue from the end of the due date; paid or draft is never overdue", () => {
    expect(daysOverdue(inv(), at("2026-10-01T20:00:00Z"))).toBe(0);
    expect(daysOverdue(inv(), at("2026-10-02T09:00:00Z"))).toBe(1);
    expect(daysOverdue(inv(), at("2026-10-08T09:00:00Z"))).toBe(7);
    expect(daysOverdue(inv({ status: "paid" }), at("2026-12-01T00:00:00Z"))).toBe(0);
    expect(daysOverdue(inv({ status: "draft" }), at("2026-12-01T00:00:00Z"))).toBe(0);
  });

  it("sends 1, 7, 14 each once, and only the latest missed one (never three at once)", () => {
    expect(reminderDue(inv(), at("2026-10-01T12:00:00Z"))).toBeNull();
    expect(reminderDue(inv(), at("2026-10-02T12:00:00Z"))).toBe(1);
    expect(reminderDue(inv({ remindersSent: [1] }), at("2026-10-03T12:00:00Z"))).toBeNull();
    expect(reminderDue(inv({ remindersSent: [1] }), at("2026-10-08T12:00:00Z"))).toBe(7);
    expect(reminderDue(inv(), at("2026-10-20T12:00:00Z"))).toBe(14); // cron was down: one email, not three
    expect(reminderDue(inv({ remindersSent: [14] }), at("2026-10-25T12:00:00Z"))).toBeNull();
    expect(reminderDue(inv({ remindersSent: [1, 7, 14] }), at("2026-11-30T12:00:00Z"))).toBeNull();
  });

  it("receipt and reminder say the amount and invoice, escape names, and offer Pay when there is a link", () => {
    const receipt = buildLuxorReceiptEmail(inv(), at("2026-10-05T12:00:00Z"));
    expect(receipt.subject).toBe("[Receipt] Payment received — LX-1001");
    expect(receipt.html).toContain("$299.00");
    expect(receipt.html).toContain("Apex &lt;Roofing&gt;");
    const firm = buildLuxorReminderEmail({ ...inv(), stripePaymentUrl: "https://pay.example/x" }, 14);
    expect(firm.subject).toBe("[Final reminder] Invoice LX-1001 is overdue");
    expect(firm.html).toContain("https://pay.example/x");
    expect(firm.html).toContain("phone line keeps answering");
    expect(buildLuxorReminderEmail(inv(), 1).subject).toBe("[Reminder] Invoice LX-1001 is overdue");
  });
});
