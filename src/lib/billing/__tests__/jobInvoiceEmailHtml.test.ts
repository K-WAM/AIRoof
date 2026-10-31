import { describe, it, expect } from "vitest";
import { buildJobInvoiceEmailHtml } from "../jobInvoiceEmailHtml";
import type { JobInvoice } from "@/types/invoice";

function invoice(overrides: Partial<JobInvoice> = {}): JobInvoice {
  return {
    invoiceId: "INV-1001",
    businessId: "biz1",
    jobId: "J-0042",
    billTo: { name: "Wynmoor Community Council", address: "1310 Ave of the Stars, Coconut Creek, FL" },
    status: "draft",
    labor: [{ lineId: "l1", name: "Roof Mechanic", hours: 7.5, rate: 95, total: 712.5, source: "voice" }],
    materials: [{ lineId: "m1", item: "Modified bitumen", quantity: 1, unitPrice: 4244.35, total: 4244.35, source: "manual" }],
    other: [],
    hideMaterials: false,
    taxRate: 0,
    laborSubtotal: 712.5,
    materialSubtotal: 4244.35,
    otherSubtotal: 0,
    subtotal: 4956.85,
    taxAmount: 0,
    total: 4956.85,
    createdAt: Date.parse("2026-09-11"),
    updatedAt: Date.parse("2026-09-11"),
    createdBy: "user1",
    ...overrides,
  };
}

describe("buildJobInvoiceEmailHtml", () => {
  it("includes the business letterhead, invoice number, and total due", () => {
    const html = buildJobInvoiceEmailHtml(invoice(), { businessName: "Roof Doctors", contactPhone: "(954) 784-7663" });
    expect(html).toContain("Roof Doctors");
    expect(html).toContain("INV-1001");
    expect(html).toContain("(954) 784-7663");
    expect(html).toContain("$4,956.85");
  });

  it("renders the itemized materials breakdown when hideMaterials is off", () => {
    const html = buildJobInvoiceEmailHtml(invoice({ hideMaterials: false }), { businessName: "Roof Doctors" });
    expect(html).toContain("Modified bitumen");
    expect(html).not.toContain("Materials &amp; supplies");
  });

  it("collapses materials to one lump line when hideMaterials is on", () => {
    const html = buildJobInvoiceEmailHtml(invoice({ hideMaterials: true }), { businessName: "Roof Doctors" });
    expect(html).not.toContain("Modified bitumen");
    expect(html).toContain(">Materials</td>");
    expect(html).toContain("$4,244.35");
  });

  it("renders cleanly with every optional business field unset, with no leaked 'undefined'/'null' text", () => {
    const html = buildJobInvoiceEmailHtml(invoice(), { businessName: "Roof Doctors" });
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("null");
  });

  it("escapes HTML-significant characters in free-text fields", () => {
    const html = buildJobInvoiceEmailHtml(
      invoice({ billTo: { name: "<script>alert(1)</script>" }, notes: "Net 30 & due on receipt" }),
      { businessName: "Roof Doctors" },
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; due on receipt");
  });

  it("omits the Bill To block entirely when there is no name or address, rather than an empty section", () => {
    const html = buildJobInvoiceEmailHtml(invoice({ billTo: { name: "" } }), { businessName: "Roof Doctors" });
    expect(html).not.toContain("Bill To");
  });
  it("labels a paid invoice as paid and omits payment instructions", () => {
    const html = buildJobInvoiceEmailHtml(invoice({ status: "paid", amountPaid: 4956.85 }),
      { businessName: "Roof Doctors" }, [], [], [], { payInstructions: "Pay by check", payLink: "" });
    expect(html).toContain("Invoice total — paid in full");
    expect(html).not.toContain("Total Due");
    expect(html).not.toContain("Pay by check");
  });
  it("uses the reference invoice voice, five columns, and the same saved terms and due date", () => {
    const html = buildJobInvoiceEmailHtml(invoice({ terms: "Due upon completion", dueAt: Date.parse("2026-09-11T12:00:00Z"), poNumber: "PO-7", opening: "We visited the service address.", closing: "Debris removed.", thankYou: "Thank you." }), { businessName: "Business", licenseNumber: "ABC123", timezone: "America/New_York" }, [{ problem: "Leak", solution: "Repaired" }]);
    for (const text of ["License #ABC123", "Work order", "PO number", "PO-7", "Due upon completion", "Sep 11, 2026", "Item", "Description", "Qty", "Unit price", "Amount", "Problem:", "Corrective action:", "Debris removed.", "Thank you."]) expect(html).toContain(text);
    expect(html).not.toContain("Due Sep");
  });
  // Demo review 2026-10-30: $570 + $450 subtotals under a $1,091.40 total with no tax line, two "Notes"
  // headings, and "your Job needs".
  it("shows the tax line so the subtotals add up to Total Due", () => {
    const html = buildJobInvoiceEmailHtml(invoice({ taxRate: 7, subtotal: 4956.85, taxAmount: 346.98, total: 5303.83 }), { businessName: "Roof Doctors" });
    expect(html).toContain("Tax (7%)");
    expect(html).toContain("$346.98");
    expect(html).toContain("$5,303.83");
  });
  it("shows the discount and pre-discount subtotal when there is one", () => {
    const html = buildJobInvoiceEmailHtml(invoice({ discount: { kind: "amount", value: 100 }, subtotal: 4856.85, taxAmount: 0, total: 4856.85 }), { businessName: "Roof Doctors" });
    expect(html).toContain("Subtotal");
    expect(html).toContain("−$100.00");
  });
  it("adds no subtotal rows when there is no tax or discount", () => {
    const html = buildJobInvoiceEmailHtml(invoice(), { businessName: "Roof Doctors" });
    expect(html).not.toContain("Tax (");
    expect(html).not.toContain(">Subtotal<");
  });
  it("prints one Notes block with the default wording, lower-case job noun, and no photo claim", () => {
    const html = buildJobInvoiceEmailHtml(invoice(), { businessName: "Roof Doctors", industry: "roofing" });
    expect(html.match(/<strong>Notes<\/strong>/g)).toHaveLength(1);
    expect(html).not.toMatch(/your [A-Z]\w* needs/);
    expect(html).not.toContain("enclosed photos");
  });
});
