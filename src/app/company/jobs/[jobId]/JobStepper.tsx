"use client";

import type { Job } from "@/types/jobs";
import { currentStep, jobSteps, type JobStep } from "@/lib/jobs/nextStep";

/**
 * "What's next" guide under the job header: Findings -> Quote -> Work -> Report -> Invoice, with ONE primary button
 * for the current step. Advice only — every tab stays open. Derived from the job, so it can never disagree with it.
 */
export function JobStepper({ job, onGo }: { job: Job; onGo: (tab: JobStep["tab"]) => void }) {
  const steps = jobSteps(job);
  const now = currentStep(steps);
  return (
    <nav className="no-print" aria-label="Job progress" style={{ margin: "0 0 14px" }}>
      <ol style={{ display: "flex", flexWrap: "wrap", gap: 6, listStyle: "none", padding: 0, margin: "0 0 8px" }}>
        {steps.map((step, index) => (
          <li key={step.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              aria-current={step.state === "current" ? "step" : undefined}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, fontSize: 13,
                fontWeight: step.state === "current" ? 700 : 500,
                border: `1px solid ${step.state === "todo" ? "var(--border)" : "var(--accent)"}`,
                background: step.state === "done" ? "var(--accent)" : step.state === "current" ? "var(--accent-soft)" : "transparent",
                color: step.state === "done" ? "#fff" : step.state === "current" ? "var(--accent-dark)" : "var(--text-muted)",
              }}
            >
              {step.state === "done" ? "✓" : index + 1} {step.label}
            </span>
            {index < steps.length - 1 && <span aria-hidden style={{ color: "var(--text-muted)" }}>→</span>}
          </li>
        ))}
      </ol>
      {now ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="button primary" onClick={() => onGo(now.tab)}>
            Next: {now.label}
          </button>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{now.hint}</span>
        </div>
      ) : (
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>All steps are done for this job. 🎉</span>
      )}
    </nav>
  );
}
