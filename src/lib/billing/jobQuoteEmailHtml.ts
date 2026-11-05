import type { JobQuote } from "@/types/quote";
import { quoteGroups } from "@/lib/documents/groups";
import { billToBlock, documentShell, findingsBlock, footerBlock, groupsBlock, letterheadBlock, narrativeBlock, noticesBlock, notesBlock, photosBlock, totalBlock } from "@/lib/documents/emailBlocks";
import type { JobPhotoMeta } from "@/types/jobs";
import { resolveLetterhead, type LetterheadBusiness } from "@/lib/documents/letterhead";
import type { RenderedNotice } from "@/lib/documents/notices";
import { escapeHtml } from "@/lib/documents/letterhead";
import { DEFAULT_LETTERS } from "@/lib/documents/letters";
import type { LetterTemplate } from "@/types/documentTemplate";
import { quoteLetter, type LetterRate } from "@/lib/documents/quoteLetter";
import { letterHtml, signatureHtml } from "@/lib/documents/letterHtml";
import { fmtMoney } from "@/lib/format/money";

/** `notices` are only what noticesForDocument() approved for a quote (empty until the owner approves the wording). */
export function buildQuoteEmailHtml(quote: JobQuote, business: LetterheadBusiness, notices: RenderedNotice[] = [], photos: Array<JobPhotoMeta & { fullB64?: string }> = [], responseUrls?: { accept: string; decline: string }, letterContext?: { template: LetterTemplate; rates: LetterRate[] }): string {
  if (!business.businessName?.trim()) throw new Error("Business name required for quote email");
  const brand = resolveLetterhead(business);
  const meta: [string, string][] = [["Date", new Date(quote.createdAt).toLocaleDateString("en-US")], ["Number", quote.quoteId], ["Valid until", new Date(quote.validUntil).toLocaleDateString("en-US")], ["Reference", quote.jobId]];
  if (quote.serviceAt ?? quote.billTo.address) meta.push(["Service at", quote.serviceAt ?? quote.billTo.address!]);
  if (quote.showTechnicians && quote.technicians?.length) meta.push(["Technicians", quote.technicians.join(", ")]);
  const answer = responseUrls ? `<section style="margin-top:24px;padding:20px;border:1px solid #cbd5e1;border-radius:8px;text-align:center"><strong>Ready to answer this quote?</strong><p style="font-size:13px;color:#475569">Choose an option below, then confirm your choice on the next page.</p><a href="${escapeHtml(responseUrls.accept)}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:700;margin:4px">Accept quote</a><a href="${escapeHtml(responseUrls.decline)}" style="display:inline-block;border:1px solid #94a3b8;color:#334155;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:700;margin:4px">Reject quote</a></section>` : "";
  if (quote.layout === "proposal" || quote.layout === "tm_authorization") {
    const tm = quote.layout === "tm_authorization";
    const template = letterContext?.template ?? DEFAULT_LETTERS[quote.layout];
    const model = quoteLetter(quote, business, template, letterContext?.rates ?? []);
    const esc = escapeHtml;
    const scope = tm ? `<h3>Labor rates</h3><table style="width:100%"><thead><tr><th align="left">Role</th><th align="right">Hourly rate</th></tr></thead><tbody>${model.rates.map(r => `<tr><td>${esc(r.role)}</td><td align="right">${esc(fmtMoney(r.rate))}</td></tr>`).join("")}</tbody></table><p>Rates shown for reference; actual time is billed separately.</p>`
      : `<h3>Scope of work</h3><ul>${model.scope.map(s => `<li>${esc(s)}</li>`).join("")}</ul><p><strong>Price: ${esc(fmtMoney(model.total))}</strong><br/>${esc(model.priceWords)}</p><p>Valid for ${esc(model.validDays)} days.</p>`;
    return documentShell(letterheadBlock(brand, model.letter.title, meta) + billToBlock(quote.billTo) + (quote.attention ? `<p>Attention: ${esc(quote.attention)}</p>` : "") + `<p><strong>RE:</strong> ${esc([quote.serviceAt ?? quote.billTo.address, quote.description, `Work order ${quote.jobId}`].filter(Boolean).join(" · "))}</p>` + narrativeBlock(quote.narrative) + letterHtml(model.letter) + scope + signatureHtml(template.signer?.name ?? "", template.signer?.title ?? "", tm) + photosBlock(photos) + (tm ? answer.replace("Accept quote", "Authorize") : answer) + noticesBlock(notices) + footerBlock(brand));
  }
  return documentShell(letterheadBlock(brand, "Quote", meta) + billToBlock(quote.billTo) + narrativeBlock(quote.narrative) + findingsBlock(quote.findings) + groupsBlock(quoteGroups(quote)) + totalBlock("Estimated Total", quote.total, brand.brandColor) + notesBlock(quote.notes) + photosBlock(photos) + answer + noticesBlock(notices) + footerBlock(brand));
}
