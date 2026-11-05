// Company-dependent default wording (T-316 fix round). Invoice closing/thank-you, deposit and invoice openings,
// quote intros and other generated text embed the company that was resolved when the text was created. A company
// switch must not leave the previous company's name on a customer document, while wording the office edited must
// never be overwritten. These helpers are pure: callers pass the generated default for each company name.

import { DEFAULT_INVOICE_COPY, fillInvoiceCopy } from "@/lib/documents/invoiceCopy";
import type { BillingCompany } from "@/types/company";

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
): string | undefined {
  if (!stored) return stored;
  if (stored === generate(resolvedName)) return stored;
  for (const name of names) {
    if (name !== resolvedName && stored === generate(name)) return generate(resolvedName);
  }
  return stored;
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
