import { describe, expect, it } from "vitest";
import { buildQuoteEmailHtml } from "../jobQuoteEmailHtml";
import { buildJobInvoiceEmailHtml } from "../jobInvoiceEmailHtml";
import type { RenderedNotice } from "@/lib/documents/notices";
import type { JobInvoice } from "@/types/invoice";
import type { JobQuote } from "@/types/quote";

const business = { businessName: "Roof Doctors", licenseNumber: "CCC1325784" };
const quote = {
  quoteId: "Q-1", businessId: "biz", jobId: "J-1", billTo: { name: "Ana" }, status: "draft", findings: [], lines: [], hideMaterials: false,
  validUntil: Date.parse("2026-10-30"), subtotal: 3000, total: 3000, createdAt: Date.parse("2026-09-25"), updatedAt: 1, createdBy: "u",
} as unknown as JobQuote;
const invoice = {
  invoiceId: "INV-1", businessId: "biz", jobId: "J-1", billTo: { name: "Ana" }, status: "draft", labor: [], materials: [], other: [],
  hideMaterials: false, taxRate: 0, laborSubtotal: 0, materialSubtotal: 0, otherSubtotal: 0, subtotal: 3000, taxAmount: 0, total: 3000,
  createdAt: Date.parse("2026-09-25"), updatedAt: 1, createdBy: "u",
} as unknown as JobInvoice;
const notices: RenderedNotice[] = [
  { id: "fl-lien-713", title: "Florida Construction Lien Law", text: "Statutory lien wording for Roof Doctors.", statutory: true },
  { id: "payment-terms", title: "Payment terms", text: "Payment is due on completion.", statutory: false },
];

describe("Terms & notices on customer emails", () => {
  it("a quote prints the notices it is given, statutory ones emphasised", () => {
    const html = buildQuoteEmailHtml(quote, business, notices);
    expect(html).toContain("Terms &amp; notices");
    expect(html).toContain("Statutory lien wording for Roof Doctors.");
    expect(html).toContain("Payment is due on completion.");
  });

  it("an invoice prints the notices it is given", () => {
    const html = buildJobInvoiceEmailHtml(invoice, business, [], notices);
    expect(html).toContain("Terms &amp; notices");
    expect(html).toContain("Florida Construction Lien Law");
  });

  it("with no notices (nothing approved) neither document mentions Terms & notices", () => {
    expect(buildQuoteEmailHtml(quote, business)).not.toContain("Terms &amp; notices");
    expect(buildJobInvoiceEmailHtml(invoice, business)).not.toContain("Terms &amp; notices");
  });

  it("escapes HTML in notice wording", () => {
    const html = buildQuoteEmailHtml(quote, business, [{ id: "x", title: "<b>T</b>", text: "<script>alert(1)</script>", statutory: false }]);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>T</b>");
  });
});
