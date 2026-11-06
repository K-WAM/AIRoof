// Company-dependent default wording (T-316 fix round). Invoice closing/thank-you, deposit and invoice openings,
// quote intros and other generated text embed the company that was resolved when the text was created. A company
// switch must not leave the previous company's name on a customer document, while wording the office edited must
// never be overwritten. These helpers are pure: callers pass the generated default for each company name.

import { DEFAULT_INVOICE_COPY, fillInvoiceCopy } from "@/lib/documents/invoiceCopy";
import { draftQuoteIntro } from "@/lib/billing/draftQuoteIntro";
import { getVerticalTemplate } from "@/lib/verticals/templates";
import { fmtDate } from "@/lib/format";
import { companiesOf } from "./companies";
import type { BillingCompany } from "@/types/company";
import type { JobInvoice } from "@/types/invoice";
import type { JobQuote } from "@/types/quote";

export type InvoiceCopyValues = { address: string; visitDate: string; industryNoun: string };

export function invoiceCopyDefaults(name: string, values: InvoiceCopyValues) {
  return {
    closing: fillInvoiceCopy(DEFAULT_INVOICE_COPY.closing, { businessName: name, ...values }),
    thankYou: fillInvoiceCopy(DEFAULT_INVOICE_COPY.thankYou, { businessName: name, ...values }),
  };
}

/**
 * A stored draft text still equal to the generated default (for ANY known company) is regenerated for the resolved
 * company. Text the office edited is returned unchanged. `generate` must be deterministic for a company name.
 */
export function refreshGeneratedText(
  stored: string | undefined,
  names: readonly string[],
  resolvedName: string,
  generate: (name: string) => string,
  /** An earlier version of the same default (wording fixed since); a draft still holding it counts as generated. */
  legacy?: (name: string) => string,
): string | undefined {
  if (!stored || !resolvedName) return stored;
  if (stored === generate(resolvedName)) return stored;
  for (const name of names) {
    if (name !== resolvedName && stored === generate(name)) return generate(resolvedName);
    if (legacy && stored === legacy(name)) return generate(resolvedName);
  }
  return stored;
}

type BusinessCopyProfile = { billingCompanies?: unknown; industry?: string; timezone?: string; invoiceCopy?: { closing?: string; thankYou?: string } };
type JobCopyFacts = { address?: string; scheduledStart?: number; createdAt?: number };

/** The draft's closing/thank-you as they should read under `resolvedName`; staff-edited text is kept as written. */
export function resolvedInvoiceCopy(invoice: Pick<JobInvoice, "closing" | "thankYou" | "createdAt">, business: BusinessCopyProfile, job: JobCopyFacts, resolvedName: string) {
  const names = companiesOf(business).map((company) => company.name);
  const values = (): InvoiceCopyValues => ({
    address: job.address ?? "the service address",
    visitDate: fmtDate(job.scheduledStart ?? job.createdAt ?? invoice.createdAt, business.timezone ?? "America/New_York"),
    industryNoun: getVerticalTemplate(business.industry ?? "").vocab.industryNoun,
  });
  const generate = (name: string, key: "closing" | "thankYou", industryNoun?: string) => {
    const filled = { businessName: name, ...values(), ...(industryNoun ? { industryNoun } : {}) };
    return fillInvoiceCopy(business.invoiceCopy?.[key] ?? DEFAULT_INVOICE_COPY[key], filled);
  };
  // Before 2026-11-06 {industryNoun} was filled with the job noun ("your job needs"): such drafts are still generated text.
  const legacyNoun = getVerticalTemplate(business.industry ?? "").vocab.jobNoun;
  return {
    closing: refreshGeneratedText(invoice.closing, names, resolvedName, name => generate(name, "closing"), name => generate(name, "closing", legacyNoun)),
    thankYou: refreshGeneratedText(invoice.thankYou, names, resolvedName, name => generate(name, "thankYou"), name => generate(name, "thankYou", legacyNoun)),
  };
}

/** A quote's intro as it should read under `resolvedName`; staff-edited text is kept as written. */
export function resolvedQuoteNarrative(quote: Pick<JobQuote, "narrative" | "findings">, job: { address?: string }, business: { billingCompanies?: unknown }, resolvedName: string): string | undefined {
  return refreshGeneratedText(quote.narrative, companiesOf(business).map((company) => company.name), resolvedName, name => draftQuoteIntro(job, quote.findings ?? [], name));
}

/** The first other company whose name appears in the text, if any — the draft should ask staff to check it. */
export function staleCompanyName(text: string | undefined, companies: readonly Pick<BillingCompany, "id" | "name">[], resolvedId: string | undefined): string | undefined {
  if (!text) return undefined;
  return companies.find((company) => company.id !== resolvedId && company.name.trim() && text.includes(company.name))?.name;
}

/** True when an edited draft still names a different company. */
export function hasStaleCompany(texts: ReadonlyArray<string | undefined>, companies: readonly Pick<BillingCompany, "id" | "name">[], resolvedId: string | undefined): boolean {
  return texts.some((text) => staleCompanyName(text, companies, resolvedId) !== undefined);
}
