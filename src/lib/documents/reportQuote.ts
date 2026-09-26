import type { DocumentOptions } from "@/types/documentOptions";
import type { JobQuote } from "@/types/quote";
import { quoteTotal } from "@/lib/billing/jobQuote";
import { quoteGroups, type DocumentGroup } from "./groups";

/** A quote is only shown to the customer once it has actually been sent to them (or they accepted it). */
export const QUOTE_SHOWABLE_STATUSES: ReadonlyArray<JobQuote["status"]> = ["sent", "accepted"];

export interface ReportQuoteSection {
  heading: string;
  groups: DocumentGroup[];
  total: number;
}

/**
 * The optional "Include the quote" section of a REPORT (the report is price-free unless the office ticks this).
 *
 * Returns null — nothing is shown — unless the option is on AND the quote was sent or accepted.
 *
 * Hide flags are OR'd between the report and the quote: if EITHER hides materials (or labor) the breakdown collapses to one
 * "Materials $x" row. A report must never reveal a breakdown the quote itself hid, so the report's "off" can't override the
 * quote's "on" (quoteGroups() alone would let it: it spreads report options over the quote's).
 */
export function reportQuoteSection(
  quote: Pick<JobQuote, "quoteId" | "status" | "lines" | "hideMaterials" | "hideLabor" | "sentAt" | "answeredAt"> | null | undefined,
  options: Partial<DocumentOptions> | null | undefined,
  fmtDate: (ms: number) => string,
): ReportQuoteSection | null {
  if (options?.includeQuote !== true || !quote || !QUOTE_SHOWABLE_STATUSES.includes(quote.status)) return null;
  const hideMaterials = quote.hideMaterials === true || options.hideMaterials === true;
  const hideLabor = quote.hideLabor === true || options.hideLabor === true;
  const groups = quoteGroups(quote as JobQuote, { hideMaterials, hideLabor });
  const accepted = quote.status === "accepted";
  const at = accepted ? quote.answeredAt : quote.sentAt;
  return {
    heading: `Quote ${quote.quoteId} · ${accepted ? "Accepted" : "Sent"}${at ? ` ${fmtDate(at)}` : ""}`,
    groups,
    total: quoteTotal(quote.lines),
  };
}
