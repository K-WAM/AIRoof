import { describe, expect, it } from "vitest";
import { currentStep, jobSteps } from "./nextStep";
import type { Job } from "@/types/jobs";

const finding = { findingId: "f", category: "c", problem: "p", solution: "s", includeInReport: true, includeInQuote: true, addedAt: 1 };
const j = (over: Partial<Job> = {}) => ({ status: "inspection" as Job["status"], ...over });
const states = (job: ReturnType<typeof j>) => jobSteps(job).map((s) => `${s.id}:${s.state}`);

describe("jobSteps / currentStep", () => {
  it("a brand-new job starts at Findings", () => {
    expect(states(j())).toEqual(["findings:current", "quote:todo", "work:todo", "report:todo", "invoice:todo"]);
    expect(currentStep(jobSteps(j()))?.tab).toBe("findings");
  });

  it("findings recorded -> the quote is next, and says whether a draft already exists", () => {
    const steps = jobSteps(j({ findings: [finding] }));
    expect(currentStep(steps)?.id).toBe("quote");
    expect(currentStep(steps)?.hint).toContain("Build the quote");
    expect(currentStep(jobSteps(j({ findings: [finding], quoteId: "Q-1" })))?.hint).toContain("draft quote");
  });

  it("quote sent (status quoted) -> work is next", () => {
    expect(currentStep(jobSteps(j({ status: "quoted", findings: [finding], quoteId: "Q-1" })))?.id).toBe("work");
  });

  it("work complete -> report, then invoice", () => {
    const done = j({ status: "complete", findings: [finding], quoteId: "Q-1" });
    expect(currentStep(jobSteps(done))?.id).toBe("report");
    expect(currentStep(jobSteps({ ...done, reportNotes: "Repaired the tiles." }))?.id).toBe("invoice");
  });

  it("invoiced -> every step is done and nothing is highlighted", () => {
    const steps = jobSteps(j({ status: "invoiced", findings: [finding], quoteId: "Q-1", reportNotes: "x" }));
    expect(steps.every((s) => s.state === "done")).toBe(true);
    expect(currentStep(steps)).toBeNull();
  });

  it("is advice, not a gate: a job that skipped findings still shows later steps done", () => {
    const steps = jobSteps(j({ status: "complete" }));
    expect(steps.find((s) => s.id === "findings")?.state).toBe("current");
    expect(steps.find((s) => s.id === "work")?.state).toBe("done");
  });
});
