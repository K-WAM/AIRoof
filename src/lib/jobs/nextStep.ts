import type { Job } from "@/types/jobs";

// The job page's "what's next" guide: Findings -> Quote -> Work -> Report -> Invoice. Each step is DONE when the
// record shows evidence of it, and the CURRENT step is simply the first one that isn't. It is advice, not a gate —
// every tab stays reachable, and a job can skip a step (a small repair with no quote just moves on).

export type StepId = "findings" | "quote" | "work" | "report" | "invoice";
export type StepState = "done" | "current" | "todo";

export interface JobStep {
  id: StepId;
  label: string;
  state: StepState;
  /** The tab that does this step; the button on the current step opens it. */
  tab: "findings" | "quote" | "timeline" | "report" | "invoice";
  /** One line telling the user what to do here. */
  hint: string;
}

const QUOTE_SENT_OR_LATER: Array<Job["status"]> = ["quoted", "in_progress", "invoiced", "complete"];

/**
 * `billing: false` = the client didn't buy Billing (src/lib/products): the workflow ends at the report.
 * `quotes: false` = the industry books work at a set price (a dog walk): no Findings or Quote steps.
 */
export function jobSteps(job: Pick<Job, "status" | "findings" | "quoteId" | "reportNotes">, opts: { billing?: boolean; quotes?: boolean } = {}): JobStep[] {
  const findingsDone = (job.findings?.length ?? 0) > 0;
  const quoteDone = QUOTE_SENT_OR_LATER.includes(job.status);
  const workDone = job.status === "complete" || job.status === "invoiced";
  // The report is optional paperwork: once the job is invoiced, never nag "Next: Report" on a finished job.
  const reportDone = !!job.reportNotes?.trim() || job.status === "invoiced";
  const invoiceDone = job.status === "invoiced";

  const all: Array<Omit<JobStep, "state"> & { done: boolean }> = [
    { id: "findings", label: "Findings", tab: "findings", done: findingsDone, hint: "Record what was found — pick from the Library." },
    { id: "quote", label: "Quote", tab: "quote", done: quoteDone, hint: job.quoteId ? "Review the draft quote and send it." : "Build the quote from the findings." },
    { id: "work", label: "Work", tab: "timeline", done: workDone, hint: "The crew updates the job from the field; mark it complete when the work is done." },
    { id: "report", label: "Report", tab: "report", done: reportDone, hint: "Review the report and send it to the customer." },
    { id: "invoice", label: "Invoice", tab: "invoice", done: invoiceDone, hint: "Create the invoice and send it." },
  ];
  const raw = all.filter((step) => (opts.billing !== false || step.id !== "invoice") && (opts.quotes !== false || (step.id !== "findings" && step.id !== "quote")));
  // Never point backwards: a step the job already moved past (a small repair invoiced with no findings) stays "todo",
  // and the current step is the first open one AFTER the furthest step that is done.
  let lastDone = -1;
  raw.forEach((step, index) => { if (step.done) lastDone = index; });
  const firstOpen = raw.findIndex((step, index) => !step.done && index > lastDone);
  return raw.map(({ done, ...step }, index) => ({ ...step, state: done ? "done" : index === firstOpen ? "current" : "todo" }));
}

/** The step to highlight, or null when every step is done. */
export function currentStep(steps: JobStep[]): JobStep | null {
  return steps.find((step) => step.state === "current") ?? null;
}
