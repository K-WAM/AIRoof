import { it, expect } from "vitest";
import { buildJobReportEmailHtml } from "@/lib/billing/jobReportEmailHtml";
import { DEFAULT_LETTERS } from "./letters";
import type { JobQuote } from "@/types/quote";
it.each(["inspection_completion", "repair_completion"] as const)("%s excludes quote prices even when requested", layout => {
  const html = buildJobReportEmailHtml({ business: { businessName: "Example" }, logos: [], jobId: "J-1", title: "Service", billTo: { name: "Customer", address: "Main site" },
    options: { includeQuote: true }, reportDocument: { layout, locations: "North entry\nSouth entry", noCharge: true },
    quote: { quoteId: "Q-1", status: "accepted", lines: [{ lineId: "one", kind: "other", description: "Work", quantity: 1, unitPrice: 1760 }], subtotal: 1760 } as JobQuote,
    template: { ...DEFAULT_LETTERS[layout], sections: [{ id: "opening", body: "Completed at {{locations}}. {{price}} {{priceWords}}" }] } });
  expect(html).toContain("North entry");
  expect(html).toContain("South entry");
  expect(html).not.toContain("1,760");
  expect(html).not.toContain("Quoted total");
  expect(html.includes("There is no charge")).toBe(layout === "repair_completion");
});
