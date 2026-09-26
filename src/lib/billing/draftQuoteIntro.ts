import type { Job } from "@/types/jobs";
import type { JobFinding } from "@/types/workCatalog";
import { workBullets } from "@/lib/documents/workSummary";

// The customer-facing "Description of work" must fit validNarrative's 4000-character limit.
const MAX_CHARS = 3800;

type QuoteFinding = Pick<JobFinding, "problem" | "solution" | "includeInQuote"> & Partial<Pick<JobFinding, "lines">>;

/**
 * Deterministic (no LLM) opening for a quote, built ONLY from what will print on it: the job address and the work on the
 * findings marked "in quote", as the same short, blunt bullets the invoice uses ("• Tile replacement"). It deliberately
 * does not use the call notes — those are the AI receptionist's internal wording ("Caller says…") and do not belong on a
 * customer document. Returns "" when there is nothing to describe, so an empty quote stays empty.
 */
export function draftQuoteIntro(job: Pick<Job, "address">, findings: QuoteFinding[]): string {
  const bullets = workBullets(findings.filter((finding) => finding.includeInQuote && finding.problem.trim()));
  if (bullets.length === 0) return "";

  const where = job.address?.trim() ? ` at ${job.address.trim()}` : "";
  let text = `Following our visit${where}, this quote covers:`;
  for (const bullet of bullets) {
    const next = `${text}\n• ${bullet}`;
    if (next.length > MAX_CHARS) break;
    text = next;
  }
  return text;
}
