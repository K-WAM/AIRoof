// Opening-letter text builders shared by the company-switch route and the send routes. They reproduce exactly what
// the creation routes render, so "is this still the generated default for company X?" can be decided without guessing.

import { amountInWords, renderLetter, scopeText } from "@/lib/documents/letters";
import { fmtDate } from "@/lib/format";
import { fmtMoney } from "@/lib/format/money";
import type { Job } from "@/types/jobs";
import type { JobInvoice } from "@/types/invoice";
import type { JobQuote } from "@/types/quote";
import type { Customer } from "@/types/customer";
import type { LetterTemplate } from "@/types/documentTemplate";

type BusinessData = { timezone?: string };

export function invoiceOpeningText(template: LetterTemplate, job: Job, customer: Customer | undefined, name: string, license: string | undefined, invoice: JobInvoice, business: BusinessData, acceptedQuote: JobQuote | null): string {
  const now = invoice.createdAt ?? Date.now();
  const letter = renderLetter(template, {
    date: fmtDate(job.scheduledStart ?? job.createdAt ?? now, business.timezone ?? "America/New_York"),
    "customer.name": job.clientName, "customer.code": customer?.customerCode, billTo: customer?.address ?? job.address,
    serviceAt: job.address, workOrder: job.jobId, description: job.title,
    scope: scopeText(acceptedQuote, job.findings?.filter((finding) => finding.includeInReport)), "business.name": name, "business.license": license,
  }, { includeOptional: template.sections.filter((section) => section.defaultOn).map((section) => section.id) });
  return letter.blocks.flatMap((block) => [...(block.heading ? [block.heading] : []), ...block.paragraphs, ...(block.bullets ?? []).map((line) => `- ${line}`)]).join("\n");
}

export function depositOpeningText(template: LetterTemplate, job: Job, customer: Customer | undefined, name: string, invoice: JobInvoice, business: BusinessData): string {
  const now = invoice.createdAt ?? Date.now();
  const letter = renderLetter(template, {
    date: fmtDate(now, business.timezone ?? "America/New_York"), "customer.name": job.clientName, "customer.code": customer?.customerCode,
    serviceAt: job.address, workOrder: job.jobId, description: job.title, agreementDate: fmtDate(invoice.depositAgreementDate ?? now, business.timezone ?? "America/New_York"),
    depositPercent: String(invoice.depositPercent ?? ""), depositAmount: fmtMoney(invoice.total), price: fmtMoney(invoice.total),
    priceWords: amountInWords(invoice.total), "business.name": name,
  }, { includeOptional: template.sections.filter((section) => section.defaultOn).map((section) => section.id) });
  const progressIndex = template.sections.filter((section) => !section.optional || section.defaultOn).findIndex((section) => section.id === "progress");
  return letter.blocks.filter((_, index) => index !== progressIndex).flatMap((block) => [...block.paragraphs, ...(block.bullets ?? [])]).join("\n");
}
