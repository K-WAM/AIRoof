"use client";

import type { Job } from "@/types/jobs";
import { currentStep, jobSteps, type JobStep } from "@/lib/jobs/nextStep";

/**
 * One slim "what's next" line under the job's progress bar: a single button for the current step, with a one-line hint.
 * (An earlier version also drew its own row of step chips; that duplicated the clickable status progress bar above it and
 * was removed — the progress bar shows WHERE the job is, this only says WHAT TO DO next.) Advice only; every tab stays open.
 */
export function JobStepper({ job, onGo }: { job: Job; onGo: (tab: JobStep["tab"]) => void }) {
  const now = currentStep(jobSteps(job));
  return (
    <div className="no-print" aria-label="Next step" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "0 0 14px" }}>
      {now ? (
        <>
          <button type="button" className="button small primary" onClick={() => onGo(now.tab)}>Next: {now.label} →</button>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{now.hint}</span>
        </>
      ) : (
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Every step is done for this job.</span>
      )}
    </div>
  );
}
