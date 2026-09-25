import type { Job } from "@/types/jobs";
import type { JobFinding } from "@/types/workCatalog";

// The customer-facing "Description of work" must fit validNarrative's 4000-character limit.
const MAX_CHARS = 3800;

/**
 * Deterministic (no LLM) opening paragraph for a quote, built ONLY from what will print on it: the job address and
 * the findings marked "in quote". It deliberately does not use the call notes — those are the AI receptionist's
 * internal wording ("Caller says…") and don't belong on a customer document.
 * Returns "" when there is nothing to describe, so an empty quote stays empty.
 */
export function draftQuoteIntro(job: Pick<Job, "address">, findings: Array<Pick<JobFinding, "problem" | "includeInQuote">>): string {
  const problems = findings
    .filter((finding) => finding.includeInQuote && finding.problem.trim())
    .map((finding) => finding.problem.trim().replace(/[.\s]+$/, ""));
  if (problems.length === 0) return "";

  const where = job.address?.trim() ? ` at ${job.address.trim()}` : "";
  const head = `Thank you for the opportunity. Following our visit${where}, this quote covers the work needed to address:`;
  let text = head;
  for (const problem of problems) {
    const next = `${text}\n- ${problem}`;
    if (next.length > MAX_CHARS) break;
    text = next;
  }
  return text;
}
