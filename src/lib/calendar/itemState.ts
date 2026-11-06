// Calendar item colours (owner, 2026-11-06): mild blue = scheduled, not started · amber = in progress · green =
// complete. One rule for every calendar surface (week board, phone agenda, inspector rows), decided here and nowhere
// else. Display only: it never writes or changes a job's stored status.
//
// Unconfirmed items keep their grey dashed look ("time saved, nobody notified yet" — Guide + hint text) until work
// actually starts; the colour then shows progress whatever the confirmation state. Colour is never the only signal:
// every state has a word (WORK_STATE_LABEL) shown on the item or in its accessible name.
import type { Appointment } from "@/types";
import type { Job } from "@/types/jobs";
import { dayKey } from "@/lib/format/datetime";

export type WorkState = "scheduled" | "in_progress" | "complete";

export const WORK_STATE_LABEL: Record<WorkState, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  complete: "Complete",
};

/** Mild tints: the item's text stays dark and readable on every one (WCAG AA against `text`). */
export const WORK_STATE_STYLE: Record<WorkState, { background: string; border: string; accent: string; text: string }> = {
  scheduled: { background: "#eff6ff", border: "#bfdbfe", accent: "#3b82f6", text: "#1e40af" },
  in_progress: { background: "#fffbeb", border: "#fcd34d", accent: "#f59e0b", text: "#92400e" },
  complete: { background: "#f0fdf4", border: "#86efac", accent: "#22c55e", text: "#166534" },
};

/** The unconfirmed look (unchanged from before the colours): grey fill, dashed outline. */
export const UNCONFIRMED_STYLE = { background: "#f8fafc", border: "#94a3b8", accent: "#cbd5e1", text: "#475569" } as const;

export type JobStateInput = Pick<Job, "status" | "scheduledStart"> & { lastFieldUpdate?: { at: number } | null };

/**
 * A scheduled work visit's state.
 * - complete: the job is finished (marked complete, invoiced or paid).
 * - in_progress: field notes arrived on or after the visit's day (a "quoted" job keeps that status while the crew
 *   works, so the notes are the real signal), or the job is "in progress" and the visit's day has come.
 * - scheduled: everything else.
 */
export function jobWorkState(job: JobStateInput, now: number, tz: string): WorkState {
  if (job.status === "complete" || job.status === "invoiced") return "complete";
  if (!job.scheduledStart) return job.status === "in_progress" ? "in_progress" : "scheduled";
  const visitDay = dayKey(job.scheduledStart, tz);
  if (job.lastFieldUpdate?.at && dayKey(job.lastFieldUpdate.at, tz) >= visitDay) return "in_progress";
  if (job.status === "in_progress" && dayKey(now, tz) >= visitDay) return "in_progress";
  return "scheduled";
}

/** A booking's own status ("requested" | "confirmed" | "cancelled" | "completed") and start. */
export type BookingStateInput = { status?: Appointment["status"] | string; startTime: number };
export type LinkedJobStateInput = Pick<Job, "status"> & {
  lastFieldUpdate?: { at: number } | null;
  findings?: Array<{ addedAt?: number }>;
};

/**
 * An inspection booking's state (a booking on an inspector's row). The inspection is one visit:
 * - complete: the booking is marked completed, the job made from it has moved on to a quote or beyond, or the
 *   inspector's notes/findings are from an earlier day than today.
 * - in_progress: the inspector's notes/findings are from today (on or after the booking's day).
 * - scheduled: nothing recorded yet.
 */
export function bookingWorkState(appt: BookingStateInput, linkedJob: LinkedJobStateInput | undefined, now: number, tz: string): WorkState {
  if (appt.status === "completed") return "complete";
  if (!linkedJob) return "scheduled";
  if (linkedJob.status === "quoted" || linkedJob.status === "complete" || linkedJob.status === "invoiced") return "complete";
  const visitDay = dayKey(appt.startTime, tz);
  const activity = [linkedJob.lastFieldUpdate?.at, ...(linkedJob.findings ?? []).map((finding) => finding.addedAt)]
    .filter((at): at is number => typeof at === "number" && dayKey(at, tz) >= visitDay);
  if (activity.length === 0) return "scheduled";
  const latestDay = dayKey(Math.max(...activity), tz);
  return latestDay < dayKey(now, tz) ? "complete" : "in_progress";
}

/** The look of a placed item: unconfirmed + not started keeps the grey dashed card; otherwise the state's colour. */
export function itemLook(state: WorkState, confirmed: boolean): { background: string; border: string; accent: string; text: string; dashed: boolean } {
  if (!confirmed && state === "scheduled") return { ...UNCONFIRMED_STYLE, dashed: true };
  return { ...WORK_STATE_STYLE[state], dashed: !confirmed };
}

/** Short words for the item and its accessible name ("In progress · not confirmed"). */
export function itemStateWords(state: WorkState, confirmed: boolean): string {
  if (!confirmed && state === "scheduled") return "Not confirmed";
  return confirmed ? WORK_STATE_LABEL[state] : `${WORK_STATE_LABEL[state]} · not confirmed`;
}
