import { documentPreheader } from "@/lib/documents/emailCopy";
import type { JobQuote } from "@/types/quote";
import { quoteGroups } from "@/lib/documents/groups";
import { billToBlock, classicLetterTopBlock, documentShell, emailAccent, findingSectionsBlock, footerBlock, groupsBlock, invoiceGroupsBlock, letterheadBlock, narrativeBlock, noticesBlock, notesBlock, photosBlock, totalBlock } from "@/lib/documents/emailBlocks";
import { addressLines } from "@/lib/documents/documentStyle";
import { fmtDate } from "@/lib/format";
import { fmtPhone } from "@/lib/format/phone";
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
  const meta: [string, string][] = [["Date", new Date(quote.createdAt).toLocaleDateString("en-US")], ["Number", quote.quoteId + " · Job " + quote.jobId], ["Valid until", new Date(quote.validUntil).toLocaleDateString("en-US")]];
  if (quote.serviceAt ?? quote.billTo.address) meta.push(["Service at", quote.serviceAt ?? quote.billTo.address!]);
  if (quote.showTechnicians && quote.technicians?.length) meta.push(["Technicians", quote.technicians.join(", ")]);
  const answer = responseUrls ? `<section style="margin-top:24px;padding:20px;border:1px solid #cbd5e1;border-radius:8px;text-align:center"><strong>Ready to answer this quote?</strong><p style="font-size:13px;color:#475569">Choose an option below, then confirm your choice on the next page.</p><a href="${escapeHtml(responseUrls.accept)}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:700;margin:4px">Accept quote</a><a href="${escapeHtml(responseUrls.decline)}" style="display:inline-block;border:1px solid #94a3b8;color:#334155;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:700;margin:4px">Reject quote</a></section>` : "";
  if (quote.layout === "proposal" || quote.layout === "tm_authorization") {
    const tm = quote.layout === "tm_authorization";
    const template = letterContext?.template ?? DEFAULT_LETTERS[quote.layout];
    const model = quoteLetter(quote, business, template, letterContext?.rates ?? []);
    const esc = escapeHtml;
    const scope = tm ? `<h3>Labor rates</h3><table style="width:100%"><thead><tr><th align="left">Role</th><th align="right">Hourly rate</th></tr></thead><tbody>${model.rates.map(r => `<tr><td>${esc(r.role)}</td><td align="right">${esc(fmtMoney(r.rate))}</td></tr>`).join("")}</tbody></table><p>Rates shown for reference; actual time is billed separately.</p>`
      : `${model.scope.length ? `<h3>Scope of work</h3><ul>${model.scope.map(s => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}<p><strong>Price: ${esc(fmtMoney(model.total))}</strong><br/>${esc(model.priceWords)}</p><p>Valid for ${esc(model.validDays)} days.</p>`;
    if (brand.documentStyle === "classic") {
      // Classic typed letter (documentStyle): band + logo, date, addressee left and RE block right, centred title,
      // serif body with underlined headings, two-column signature, license/website footer.
      const tz = business.timezone ?? "America/New_York";
      const addressee = [esc(quote.billTo.name), ...addressLines(quote.billTo.address).map(esc), quote.attention ? `<strong>Attn: ${esc(quote.attention)}</strong>` : "", quote.billTo.email ? `Email: ${esc(quote.billTo.email)}` : "", quote.billTo.phone ? `Phone: ${esc(fmtPhone(quote.billTo.phone))}` : ""].filter(Boolean).join("<br/>");
      const re = [quote.serviceAt ?? quote.billTo.address ? esc((quote.serviceAt ?? quote.billTo.address)!) : "", quote.description ? `RE: ${esc(quote.description)}` : "", `WO# ${esc(quote.jobId)}`].filter(Boolean).join("<br/>");
      const classicScope = tm
        ? `<h3 style="font-size:15px;font-style:italic;font-weight:700;text-decoration:underline;margin:14px 0 6px">Labor rates</h3><ul>${model.rates.map(r => `<li><strong><em>${esc(r.role)}</em></strong> @ ${esc(fmtMoney(r.rate))} per hr.</li>`).join("")}</ul><p style="font-size:13px">Rates shown for reference; actual time is billed separately.</p>`
        : `${model.scope.length ? `<h3 style="font-size:15px;font-style:italic;font-weight:700;text-decoration:underline;margin:14px 0 6px">Scope of Work:</h3><ul>${model.scope.map(s => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}<p><strong style="font-style:italic;text-decoration:underline">Price:</strong> <strong><em>${esc(model.priceWords)} (${esc(fmtMoney(model.total))})</em></strong>.${model.letter.blocks.some((block) => block.paragraphs.some((p) => /\bvalid\b|in effect/i.test(p))) ? "" : ` Valid for ${esc(model.validDays)} days.`}</p>`;
      const line = '<div style="border-bottom:1px solid #111827;height:28px"></div>';
      const signature = `<table role="presentation" style="width:100%;margin-top:32px;border-collapse:collapse"><tr><td style="width:50%;vertical-align:top;padding-right:20px">${line}<div>${tm ? "Authorized" : "Accepted"} by: &nbsp; &nbsp; &nbsp; &nbsp; Date:</div>${line}<div>Printed name:</div></td><td style="width:50%;vertical-align:top">${line}<div>${esc(brand.businessName ?? "")}</div>${template.signer?.name ? `<div><strong>${esc(template.signer.name)}</strong></div>` : ""}${template.signer?.title ? `<div>${esc(template.signer.title)}</div>` : ""}</td></tr></table>`;
      const body = `<div style="font-family:'Times New Roman',Times,Georgia,serif;font-size:14px;color:#111827">${classicLetterTopBlock(brand)}<p>${esc(fmtDate(quote.createdAt, tz))}</p><table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="vertical-align:top;width:55%;line-height:1.45">${addressee}</td><td style="vertical-align:top;text-align:right;font-weight:700;line-height:1.45">${re}</td></tr></table><h2 style="text-align:center;font-style:italic;text-decoration:underline;font-size:19px;margin:22px 0 10px">${esc(model.letter.title)}</h2>${quote.narrative ? `<p style="white-space:pre-wrap;line-height:1.65">${esc(quote.narrative)}</p>` : ""}${letterHtml(model.letter, true)}${classicScope}${signature}</div>`;
      return documentShell(body + photosBlock(photos) + (tm ? answer.replace("Accept quote", "Authorize") : answer) + noticesBlock(notices) + footerBlock(brand), documentPreheader(brand.businessName ?? "", "Your document is ready to review."));
    }
    return documentShell(letterheadBlock(brand, model.letter.title, meta) + billToBlock(quote.billTo) + (quote.attention ? `<p>Attention: ${esc(quote.attention)}</p>` : "") + `<p><strong>RE:</strong> ${esc([quote.serviceAt ?? quote.billTo.address, quote.description, `Work order ${quote.jobId}`].filter(Boolean).join(" · "))}</p>` + narrativeBlock(quote.narrative) + letterHtml(model.letter) + scope + signatureHtml(template.signer?.name ?? "", template.signer?.title ?? "", tm) + photosBlock(photos) + (tm ? answer.replace("Accept quote", "Authorize") : answer) + noticesBlock(notices) + footerBlock(brand), documentPreheader(brand.businessName ?? "", "Your document is ready to review."));
  }
  return documentShell(letterheadBlock(brand, "Quote", meta) + billToBlock(quote.billTo) + narrativeBlock(quote.narrative) + findingSectionsBlock(quote.findings) + (brand.documentStyle === "classic" ? invoiceGroupsBlock(quoteGroups(quote), true) : groupsBlock(quoteGroups(quote))) + totalBlock("Estimated Total", quote.total, emailAccent(brand)) + notesBlock(quote.notes) + photosBlock(photos) + answer + noticesBlock(notices) + footerBlock(brand), documentPreheader(brand.businessName ?? "", "Your document is ready to review."));
}
