import type { JobQuote } from "@/types/quote";
import { quoteGroups } from "@/lib/documents/groups";
import { billToBlock, documentShell, findingsBlock, footerBlock, groupsBlock, letterheadBlock, narrativeBlock, noticesBlock, notesBlock, photosBlock, totalBlock } from "@/lib/documents/emailBlocks";
import type { JobPhotoMeta } from "@/types/jobs";
import { resolveLetterhead, type LetterheadBusiness } from "@/lib/documents/letterhead";
import type { RenderedNotice } from "@/lib/documents/notices";
import { escapeHtml } from "@/lib/documents/letterhead";

/** `notices` are only what noticesForDocument() approved for a quote (empty until the owner approves the wording). */
export function buildQuoteEmailHtml(quote: JobQuote, business: LetterheadBusiness, notices: RenderedNotice[] = [], photos: Array<JobPhotoMeta & { fullB64?: string }> = [], responseUrls?: { accept: string; decline: string }): string {
  if (!business.businessName?.trim()) throw new Error("Business name required for quote email");
  const brand = resolveLetterhead(business);
  const meta: [string, string][] = [["Date", new Date(quote.createdAt).toLocaleDateString("en-US")], ["Number", quote.quoteId], ["Valid until", new Date(quote.validUntil).toLocaleDateString("en-US")], ["Reference", quote.jobId]];
  if (quote.billTo.address) meta.push(["Service at", quote.billTo.address]);
  if (quote.showTechnicians && quote.technicians?.length) meta.push(["Technicians", quote.technicians.join(", ")]);
  const answer = responseUrls ? `<section style="margin-top:24px;padding:20px;border:1px solid #cbd5e1;border-radius:8px;text-align:center"><strong>Ready to answer this quote?</strong><p style="font-size:13px;color:#475569">Choose an option below, then confirm your choice on the next page.</p><a href="${escapeHtml(responseUrls.accept)}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:700;margin:4px">Accept quote</a><a href="${escapeHtml(responseUrls.decline)}" style="display:inline-block;border:1px solid #94a3b8;color:#334155;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:700;margin:4px">Reject quote</a></section>` : "";
  return documentShell(letterheadBlock(brand, "Quote", meta) + billToBlock(quote.billTo) + narrativeBlock(quote.narrative) + findingsBlock(quote.findings) + groupsBlock(quoteGroups(quote)) + totalBlock("Estimated Total", quote.total, brand.brandColor) + notesBlock(quote.notes) + photosBlock(photos) + answer + noticesBlock(notices) + footerBlock(brand));
}
