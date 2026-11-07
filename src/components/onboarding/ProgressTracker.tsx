import type { OnboardingStep } from "@/types/onboarding";
import s from "./onboarding.module.css";
export function ProgressTracker({ steps, nextMeetingLabel, onComplete }: { steps: OnboardingStep[]; nextMeetingLabel?: string; onComplete?: (id: string, done: boolean) => void }) {
  const done = steps.filter(step => step.status === "done").length;
  const current = steps.find(step => step.status === "current");
  return <section aria-label="Onboarding progress">
    <div className={s.row}><h2>Your progress</h2><span className={s.pill}>{done} / {steps.length} complete</span></div>
    <div className={s.steps}>{steps.map((step, i) => <article className={`${s.step} ${step.status === "done" ? s.done : step.status === "current" ? s.current : ""}`} key={step.id}>
      <span className={s.circle} aria-hidden="true">{step.status === "done" ? "✓" : i + 1}</span>
      {/* An undated step shows no date line: "Not scheduled" on every card was noise (owner review, 2026-11-06). */}
      {step.date ? <span className={s.date}>{new Date(`${step.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}{step.timeLabel ? ` · ${step.timeLabel}` : ""}</span> : <span className={s.date} aria-hidden="true">&nbsp;</span>}
      <strong>{step.title}</strong><p>{step.detail}</p>
      <span className={s.status}>{step.status === "done" ? "COMPLETED" : step.status === "current" ? "IN PROGRESS" : "UPCOMING"}</span>
      {onComplete && <label className={s.choice}><input type="checkbox" checked={step.status === "done"} onChange={e => onComplete(step.id, e.target.checked)} />Mark complete</label>}
    </article>)}</div>
    <div className={s.strip}>{current ? `● In progress: ${current.title}` : done === steps.length ? "✓ All steps complete" : "Your next step will be confirmed with Luxor."}{nextMeetingLabel && <div>{nextMeetingLabel}</div>}</div>
  </section>;
}
