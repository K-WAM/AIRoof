import type { JobQuote } from "@/types/quote";
import { quoteGroups } from "@/lib/documents/groups";
import { billToBlock, documentShell, findingsBlock, footerBlock, groupsBlock, letterheadBlock, narrativeBlock, notesBlock, totalBlock } from "@/lib/documents/emailBlocks";
import { resolveLetterhead, type LetterheadBusiness } from "@/lib/documents/letterhead";

export function buildQuoteEmailHtml(quote: JobQuote, business: LetterheadBusiness): string {
  if (!business.businessName?.trim()) throw new Error("Business name required for quote email");
  const brand = resolveLetterhead(business);
  const meta: [string, string][] = [["Date", new Date(quote.createdAt).toLocaleDateString("en-US")], ["Number", quote.quoteId], ["Valid until", new Date(quote.validUntil).toLocaleDateString("en-US")], ["Reference", quote.jobId]];
  if (quote.billTo.address) meta.push(["Service at", quote.billTo.address]);
  if (quote.showTechnicians && quote.technicians?.length) meta.push(["Technicians", quote.technicians.join(", ")]);
  return documentShell(letterheadBlock(brand, "Quote", meta) + billToBlock(quote.billTo) + narrativeBlock(quote.narrative) + findingsBlock(quote.findings) + groupsBlock(quoteGroups(quote)) + totalBlock("Estimated Total", quote.total, brand.brandColor) + notesBlock(quote.notes) + `<p style="margin-top:20px;font-size:12px;color:#64748b">This quote cannot be accepted or paid online. Please contact the business directly to discuss it. Acceptance is recorded by staff.</p>` + footerBlock(brand));
}
