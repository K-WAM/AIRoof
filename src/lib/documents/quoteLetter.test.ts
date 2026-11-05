import { it, expect } from "vitest";
import { quoteLetter } from "./quoteLetter";
import { DEFAULT_LETTERS } from "./letters";
import { buildQuoteEmailHtml } from "@/lib/billing/jobQuoteEmailHtml";
import type { JobQuote } from "@/types/quote";
const quote = { businessId: "b", status: "draft", updatedAt: 1, createdBy: "u", quoteId: "Q-7", jobId: "J-3", createdAt: 1, validUntil: 864000001, lines: [{ lineId: "scope", kind: "other", description: "Restore entry", quantity: 1, unitPrice: 1250.5 }], billTo: { name: "Customer" }, findings: [], hideMaterials: false, subtotal: 1250.5, total: 1250.5 } as JobQuote;
it("renders scope, price words and project price from the shared totals", () => {
  const model = quoteLetter({ ...quote, priceMode: "project", customerSubtotal: 2695 }, {}, DEFAULT_LETTERS.proposal);
  expect(model.total).toBe(2695);
  expect(model.priceWords).toBe("Two Thousand Six Hundred Ninety-Five Dollars");
  expect(model.scope).toEqual(["Restore entry"]);
});
it("escapes tenant text in proposal email and keeps T&M rates unmultiplied", () => {
  const html = buildQuoteEmailHtml({ ...quote, layout: "proposal", description: "<script>" }, { businessName: "Example" });
  expect(html).toContain("One Thousand Two Hundred Fifty Dollars and 50/100");
  expect(html).not.toContain("<script>");
  const tm = buildQuoteEmailHtml({ ...quote, layout: "tm_authorization" }, { businessName: "Example" }, [], [], { accept: "/yes", decline: "/no" }, { template: DEFAULT_LETTERS.tm_authorization, rates: [{ role: "Service lead", rate: 75 }] });
  expect(tm).toContain("Service lead");
  expect(tm).toContain("$75.00");
  expect(tm).toContain(">Authorize</a>");
  expect(tm).not.toContain("$1,250.50");
});
