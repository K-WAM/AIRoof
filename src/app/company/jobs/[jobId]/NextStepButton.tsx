"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { Job } from "@/types/jobs";
import { currentStep, jobSteps, type JobStep } from "@/lib/jobs/nextStep";

/**
 * The job header's ONE primary action: it always points at the next unfinished step of the job's workflow
 * (Findings -> Quote -> Work -> Report -> Invoice). For the Work step it does the thing itself — the office marks the
 * job complete (the crew no longer can) — every other step just opens its tab. Advice, not a gate: every tab stays open,
 * and when every step is done there is nothing left to press, so it renders nothing.
 */
export function NextStepButton({ job, busy = false, onGo, onCompleteWork }: {
  job: Pick<Job, "status" | "findings" | "quoteId" | "reportNotes">;
  busy?: boolean;
  onGo: (tab: JobStep["tab"]) => void;
  onCompleteWork: () => void;
}) {
  const now = currentStep(jobSteps(job));
  if (!now) return null;
  if (now.id === "work") {
    return (
      <button type="button" className="button primary" title={now.hint} disabled={busy} onClick={onCompleteWork} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <CheckCircle2 size={15} strokeWidth={1.75} />
        {busy ? "Saving…" : "Mark work complete"}
      </button>
    );
  }
  return (
    <button type="button" className="button primary" title={now.hint} onClick={() => onGo(now.tab)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      Next: {now.label}
      <ArrowRight size={15} strokeWidth={1.75} />
    </button>
  );
}
