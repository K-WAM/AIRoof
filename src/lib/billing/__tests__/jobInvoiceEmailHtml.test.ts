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
    expect(html).toContain("$4956.85"); // fmt() doesn't group thousands (matches the rest of the app's $ formatting)
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
    expect(html).toContain("$4244.35");
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
});
