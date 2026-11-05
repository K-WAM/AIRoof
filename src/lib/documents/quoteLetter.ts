import type { JobQuote } from "@/types/quote";
import type { LetterTemplate } from "@/types/documentTemplate";
import type { LetterheadBusiness } from "./letterhead";
import { amountInWords, renderLetter, scopeText } from "./letters";
import { customerTotals } from "@/lib/billing/jobCustomerTotals";
import { quoteTotal } from "@/lib/billing/jobQuote";
import { fmtMoney } from "@/lib/format/money";
import { fmtDate } from "@/lib/format";

export type LetterRate = { role: string; rate: number };
export function quoteLetter(quote: JobQuote, business: LetterheadBusiness, template: LetterTemplate, rates: LetterRate[] = []) {
  const total = customerTotals({ kind: "quote", lineSubtotal: quoteTotal(quote.lines), priceMode: quote.priceMode, customerSubtotal: quote.customerSubtotal }).total;
  const validDays = String(Math.max(0, Math.ceil((quote.validUntil - quote.createdAt) / 86400000)));
  const letter = renderLetter(template, {
    date: fmtDate(quote.createdAt, business.timezone ?? "America/New_York"), "customer.name": quote.billTo.name,
    "customer.code": quote.customerCode, attention: quote.attention, billTo: quote.billTo.address, serviceAt: quote.serviceAt ?? quote.billTo.address,
    workOrder: quote.jobId, poNumber: quote.poNumber, description: quote.description ?? quote.narrative,
    scope: scopeText(quote), price: fmtMoney(total), priceWords: amountInWords(total), validDays, "business.name": business.businessName,
    "business.license": business.licenseNumber, "signer.name": template.signer?.name, "signer.title": template.signer?.title,
    ratesTable: rates.map(r => `${r.role}: ${fmtMoney(r.rate)} per hour`).join("\n"),
  }, { includeOptional: quote.includeOptional ?? template.sections.filter(s => s.defaultOn).map(s => s.id) });
  const hasScope = template.sections.some(section => (!section.optional || (quote.includeOptional ?? template.sections.filter(s => s.defaultOn).map(s => s.id)).includes(section.id)) && /\{\{\s*scope\s*\}\}/.test(section.body));
  return { letter, total, priceWords: amountInWords(total), validDays, scope: hasScope ? [] : quote.lines.map(line => line.description), rates };
}
