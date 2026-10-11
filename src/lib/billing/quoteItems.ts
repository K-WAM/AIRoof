import type { JobFinding, WorkCatalogItem } from "@/types/workCatalog";
import type { JobQuote, QuoteLine } from "@/types/quote";
import { copyCatalogFinding } from "@/lib/jobs/findings";

// Quote items = "Issue -> Work -> Price". A quote item is a finding (the issue + the standard work wording) plus the
// priced lines that came with it, tied together by QuoteLine.findingId. Everything here is pure; totals are NOT
// computed here — callers keep using quoteTotal() so there is exactly one place that does money math.

export type QuoteContent = Pick<JobQuote, "findings" | "lines">;

export interface QuoteItemGroup {
  /** null = the "Other work" bucket: lines that belong to no finding. */
  finding: JobFinding | null;
  lines: QuoteLine[];
}

/** Lines a finding contributes to a quote. lineIds are deterministic so re-adding never duplicates a row. */
export function linesForFinding(finding: JobFinding): QuoteLine[] {
  return (finding.lines ?? []).map((line, index) => ({
    ...line, lineId: `finding_${finding.findingId}_${index}`, findingId: finding.findingId,
  }));
}

/** Adds a finding (and its priced lines) to the quote. A Library item already on the quote is left alone. */
export function addFindingToQuote(quote: QuoteContent, finding: JobFinding): QuoteContent & { added: boolean } {
  if (finding.itemId && quote.findings.some((existing) => existing.itemId === finding.itemId)) {
    return { findings: quote.findings, lines: quote.lines, added: false };
  }
  const forQuote: JobFinding = { ...finding, includeInQuote: true };
  return {
    findings: [...quote.findings, forQuote],
    lines: [...quote.lines, ...linesForFinding(forQuote)],
    added: true,
  };
}

/** Removes an item from the quote: the finding AND every priced line that belongs to it. */
export function removeFindingFromQuote(quote: QuoteContent, findingId: string): QuoteContent {
  return {
    findings: quote.findings.filter((finding) => finding.findingId !== findingId),
    lines: quote.lines.filter((line) => line.findingId !== findingId),
  };
}

const onQuote = (quote: QuoteContent, finding: JobFinding) =>
  quote.findings.some((existing) => existing.findingId === finding.findingId || (!!finding.itemId && existing.itemId === finding.itemId));

/**
 * Carries a Findings-tab save onto a draft quote (owner, 2026-10-10: "I added findings, and they didn't show in the
 * quote"). Only transitions count: a finding newly marked "In quote" (or added already marked) is added with its priced
 * lines; one newly unmarked or deleted is removed. A finding whose mark did not change is left as the quote has it, so
 * an item removed or edited on the Quote tab stays that way.
 */
export function syncQuoteWithFindings(quote: QuoteContent, before: JobFinding[], after: JobFinding[]): QuoteContent & { changed: boolean } {
  const wasIn = new Set(before.filter((finding) => finding.includeInQuote).map((finding) => finding.findingId));
  const isIn = new Set(after.filter((finding) => finding.includeInQuote).map((finding) => finding.findingId));
  let next: QuoteContent = { findings: quote.findings, lines: quote.lines };
  let changed = false;
  for (const findingId of wasIn) {
    if (isIn.has(findingId) || !next.findings.some((finding) => finding.findingId === findingId)) continue;
    next = removeFindingFromQuote(next, findingId);
    changed = true;
  }
  for (const finding of after) {
    if (!finding.includeInQuote || wasIn.has(finding.findingId) || onQuote(next, finding)) continue;
    const added = addFindingToQuote(next, finding);
    next = { findings: added.findings, lines: added.lines };
    changed ||= added.added;
  }
  return { ...next, changed };
}

/** The job's "In quote" findings that this quote does not carry (e.g. added before the sync above existed). */
export function findingsMissingFromQuote(quote: QuoteContent, jobFindings: JobFinding[] | undefined): JobFinding[] {
  return (jobFindings ?? []).filter((finding) => finding.includeInQuote && !onQuote(quote, finding));
}

/** A Library item, snapshotted for a job/quote at the moment it is picked. */
export function findingFromCatalogItem(item: WorkCatalogItem): JobFinding {
  return copyCatalogFinding(item);
}

/** A one-off ("Custom item"): free-text problem + work, and an optional price as a single "other" line. */
export function customFinding(input: { problem: string; solution: string; price?: number; itemId?: string; category?: string; now?: number }): JobFinding {
  const problem = input.problem.trim();
  const price = typeof input.price === "number" && Number.isFinite(input.price) && input.price > 0 ? Math.round(input.price * 100) / 100 : 0;
  return {
    findingId: crypto.randomUUID(),
    ...(input.itemId ? { itemId: input.itemId } : {}),
    category: input.category ?? "Custom",
    problem,
    solution: input.solution.trim(),
    ...(price > 0 ? { lines: [{ description: problem, quantity: 1, unitPrice: price, kind: "other" as const }] } : {}),
    includeInReport: true,
    includeInQuote: true,
    addedAt: input.now ?? Date.now(),
  };
}

/** Groups lines under their finding (in finding order); anything unmatched goes to "Other work" last. */
export function groupQuoteItems(quote: QuoteContent): QuoteItemGroup[] {
  const known = new Set(quote.findings.map((finding) => finding.findingId));
  const groups: QuoteItemGroup[] = quote.findings.map((finding) => ({
    finding, lines: quote.lines.filter((line) => line.findingId === finding.findingId),
  }));
  const other = quote.lines.filter((line) => !line.findingId || !known.has(line.findingId));
  return other.length ? [...groups, { finding: null, lines: other }] : groups;
}
