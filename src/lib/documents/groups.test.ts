// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { JobInvoice } from "@/types/invoice";
import type { JobQuote } from "@/types/quote";
import { invoiceGroups, quoteGroups } from "./groups";
import { buildJobInvoiceEmailHtml } from "@/lib/billing/jobInvoiceEmailHtml";
import { buildQuoteEmailHtml } from "@/lib/billing/jobQuoteEmailHtml";
import { escapeHtml, resolveLetterhead } from "./letterhead";
import { reportQuoteSection } from "./reportQuote";
import { DocumentPreview } from "./DocumentPreview";
import { createElement } from "react";
import { render } from "@testing-library/react";

const invoice = {
  invoiceId: "INV-1", businessId: "b", jobId: "j", billTo: { name: "Customer" }, status: "draft",
  labor: [{ lineId: "l", name: "SECRET_WORKER", hours: 2, rate: 30, total: 60, source: "manual" }],
  materials: [{ lineId: "m", item: "SECRET_PART", quantity: 1, unitPrice: 40, total: 40, source: "manual" }],
  other: [], hideMaterials: false, taxRate: 0, laborSubtotal: 60, materialSubtotal: 40, otherSubtotal: 0,
  subtotal: 100, taxAmount: 0, total: 100, createdAt: 1, updatedAt: 1, createdBy: "u",
} as JobInvoice;
const quote = {
  quoteId: "Q-1", businessId: "b", jobId: "j", billTo: { name: "Customer" }, status: "draft",
  findings: [], lines: [{ lineId: "l", kind: "labor", description: "SECRET_WORKER", quantity: 2, unitPrice: 30 },
    { lineId: "m", kind: "material", description: "SECRET_PART", quantity: 1, unitPrice: 40 }],
  hideMaterials: false, validUntil: 1000000000000, subtotal: 100, total: 100, createdAt: 1, updatedAt: 1, createdBy: "u",
} as JobQuote;

describe("customer document groups", () => {
  it("renders only one project price row across saved quote, invoice and report presentations", () => {
    const projectQuote = { ...quote, status: "accepted" as const, priceMode: "project" as const, customerSubtotal: 250, subtotal: 250, total: 250, adjustmentNote: "INTERNAL_NOTE" };
    const projectInvoice = { ...invoice, priceMode: "project" as const, customerSubtotal: 250, subtotal: 250, total: 250, adjustmentNote: "INTERNAL_NOTE" };
    expect(quoteGroups(projectQuote)).toEqual([{ title: "Project price", rows: [{ description: "Project price", amount: 250 }], subtotal: 250 }]);
    expect(invoiceGroups(projectInvoice)).toEqual([{ title: "Project price", rows: [{ description: "Project price", amount: 250 }], subtotal: 250 }]);
    const report = reportQuoteSection(projectQuote, { includeQuote: true }, () => "today");
    expect(report?.total).toBe(250);
    expect(report?.groups).toEqual(quoteGroups(projectQuote));
    for (const html of [buildQuoteEmailHtml(projectQuote, { businessName: "Business" }), buildJobInvoiceEmailHtml(projectInvoice, { businessName: "Business" })]) {
      expect(html).toContain("Project price");
      for (const secret of ["SECRET_WORKER", "SECRET_PART", "INTERNAL_NOTE", "$30.00", "$40.00", "Qty", "Unit price"]) expect(html).not.toContain(secret);
    }
    const preview = render(createElement(DocumentPreview, { title: "Invoice", brand: resolveLetterhead({ businessName: "Business" }), meta: [], billTo: { name: "Customer" }, groups: invoiceGroups(projectInvoice), totalLabel: "Total Due", total: 250 })).container.innerHTML;
    expect(preview).toContain("Project price");
    for (const secret of ["SECRET_WORKER", "SECRET_PART", "$30.00", "$40.00", "Qty", "Unit price"]) expect(preview).not.toContain(secret);
  });
  for (const hideMaterials of [false, true]) for (const hideLabor of [false, true]) {
    it(`preserves true totals and visibility for invoice material=${hideMaterials} labor=${hideLabor}`, () => {
      const document = { ...invoice, hideMaterials, hideLabor };
      const groups = invoiceGroups(document);
      const html = buildJobInvoiceEmailHtml(document, { businessName: "Business" });
      expect(groups.map((group) => group.subtotal).reduce((sum, value) => sum + value, 0)).toBe(100);
      expect(html).toContain("$100.00");
      expect(html.includes("SECRET_PART")).toBe(!hideMaterials);
      expect(html.includes("SECRET_WORKER")).toBe(!hideLabor);
      if (hideMaterials) expect(groups.find((group) => group.title === "Materials")?.rows).toHaveLength(1);
      if (hideLabor) { expect(groups.find((group) => group.title === "Labor")?.rows).toHaveLength(1); expect(html).not.toContain("2 hours"); expect(html).not.toContain("$30.00"); }
    });
    it(`preserves true totals and visibility for quote material=${hideMaterials} labor=${hideLabor}`, () => {
      const document = { ...quote, hideMaterials, hideLabor };
      const groups = quoteGroups(document);
      const html = buildQuoteEmailHtml(document, { businessName: "Business" });
      expect(groups.map((group) => group.subtotal).reduce((sum, value) => sum + value, 0)).toBe(100);
      expect(html).toContain("$100.00");
      expect(html.includes("SECRET_PART")).toBe(!hideMaterials);
      expect(html.includes("SECRET_WORKER")).toBe(!hideLabor);
      if (hideLabor) expect(html).not.toContain("$30.00");
      if (hideMaterials) expect(groups.find((group) => group.title === "Materials")?.rows).toEqual([{ description: "Materials", amount: 40 }]);
    });
  }
  it("escapes HTML and prefers a library default logo", () => {
    expect(escapeHtml("<&\"' >")).toBe("&lt;&amp;&quot;&#39; &gt;");
    const logo = { b64: "AQ==", mimeType: "image/png", variant: "color", isDefault: true } as never;
    expect(resolveLetterhead({ logoUrl: "legacy" }, [logo]).logoUrl).toBe("data:image/png;base64,AQ==");
    expect(resolveLetterhead({ logoUrl: "legacy" }).logoUrl).toBe("legacy");
    expect(resolveLetterhead({}).logoUrl).toBeNull();
  });
});
