import type { Job } from "@/types/jobs";
import type { JobFinding } from "@/types/workCatalog";
import { workBullets } from "@/lib/documents/workSummary";

// The customer-facing "Description of work" must fit validNarrative's 4000-character limit.
const MAX_CHARS = 3800;

/**
 * The quote's default closing note (owner request 2026-09-28: kind, short, "a rough estimate subject to the actual
 * condition"). Industry-neutral on purpose (Industry-Applicability Rule): "on site", never "the roof". Editable per quote.
 */
export const DEFAULT_QUOTE_NOTES =
  "This is an estimate based on what we could see during our visit. The final price may change once work begins and we see the full condition on site, and we will always check with you before doing any extra work. Thank you for the opportunity to earn your business.";

type QuoteFinding = Pick<JobFinding, "problem" | "solution" | "includeInQuote"> & Partial<Pick<JobFinding, "lines">>;

/**
 * Deterministic (no LLM) opening for a quote, built ONLY from what will print on it: the job address and the work on the
 * findings marked "in quote", as the same short, blunt bullets the invoice uses ("• Tile replacement"). It deliberately
 * does not use the call notes — those are the AI receptionist's internal wording ("Caller says…") and do not belong on a
 * customer document. Returns "" when there is nothing to describe, so an empty quote stays empty.
 */
export function draftQuoteIntro(job: Pick<Job, "address">, findings: QuoteFinding[], businessName?: string): string {
  const bullets = workBullets(findings.filter((finding) => finding.includeInQuote && finding.problem.trim()));
  if (bullets.length === 0) return "";

  // A short, kind opening (the owner's own invoices open with "Pursuant to your request... technicians identified the
  // following"), then the work.
  const thanks = businessName?.trim() ? `Thank you for reaching out to ${businessName.trim()}.` : "Thank you for reaching out to us.";
  const where = job.address?.trim() ? ` ${job.address.trim()}` : " your property";
  let text = `${thanks} As requested, we visited${where} and recommend the following work:`;
  for (const bullet of bullets) {
    const next = `${text}\n• ${bullet}`;
    if (next.length > MAX_CHARS) break;
    text = next;
  }
  return text;
}
