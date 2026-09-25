import type { FieldUpdate, Job } from "@/types/jobs";
import type { JobQuote } from "@/types/quote";
import type { JobInvoice } from "@/types/invoice";

// The job's chronological audit trail: call -> request -> job created -> scheduled -> arrival -> field updates ->
// photos -> findings -> quote -> invoice ... It is DERIVED, on read, from timestamps that already exist on the
// records (there is deliberately no second event store to drift out of step). An event whose timestamp we don't
// have is left out rather than invented.

export type HistoryKind = "call" | "request" | "job" | "schedule" | "arrive" | "depart" | "field" | "photo" | "finding" | "quote" | "invoice" | "status";

export interface HistoryEvent {
  id: string;
  at: number;
  kind: HistoryKind;
  title: string;
  detail?: string;
  by?: string;
}

export interface HistorySources {
  job: Job;
  call?: { callId: string; startedAt?: number; createdAt?: number; callerName?: string; summary?: string | null } | null;
  appointment?: { appointmentId: string; createdAt?: number; callerName?: string; serviceType?: string } | null;
  updates?: FieldUpdate[];
  photos?: Array<{ photoId: string; label?: string; uploadedBy?: string; createdAt: number }>;
  punches?: Array<{ punchId: string; type: string; workerName?: string; at: number; jobId?: string }>;
  quote?: JobQuote | null;
  invoice?: JobInvoice | null;
}

const STATUS_LABEL: Record<string, string> = {
  open: "Open", inspection: "Inspection", quoted: "Quoted", in_progress: "In progress", invoiced: "Invoiced", complete: "Complete",
};

const KIND_ORDER: HistoryKind[] = ["call", "request", "job", "schedule", "status", "arrive", "field", "photo", "finding", "depart", "quote", "invoice"];

const clip = (text: string | null | undefined, max: number): string | undefined => {
  const t = text?.replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
const isTime = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

export function buildJobHistory(src: HistorySources): HistoryEvent[] {
  const { job } = src;
  const events: HistoryEvent[] = [];
  const add = (event: HistoryEvent | null) => { if (event && isTime(event.at)) events.push(event); };

  const call = src.call;
  if (call) {
    add({ id: `call-${call.callId}`, at: call.startedAt ?? call.createdAt ?? 0, kind: "call", title: "Call received",
      by: call.callerName, detail: clip(call.summary, 200) });
  }

  const appt = src.appointment;
  if (appt) {
    add({ id: `appt-${appt.appointmentId}`, at: appt.createdAt ?? 0, kind: "request", title: "Appointment requested",
      by: appt.callerName, detail: appt.serviceType });
  }

  add({ id: `job-${job.jobId}`, at: job.createdAt, kind: "job", title: "Job created",
    detail: job.sourceCallId ? "From a phone call" : job.appointmentId ? "From an appointment request" : job.leadId ? "From a lead" : undefined });

  if (job.assignedCrewId || job.scheduledStart) {
    add({ id: `sched-${job.jobId}`, at: job.scheduledStart ?? 0, kind: "schedule", title: "Visit scheduled",
      detail: job.crewConfirmed ? "Crew confirmed" : undefined });
  }

  for (const [index, change] of (job.statusHistory ?? []).entries()) {
    add({ id: `status-${index}-${change.at}`, at: change.at, kind: "status", title: `Status: ${STATUS_LABEL[change.status] ?? change.status}`, by: change.by });
  }

  for (const punch of src.punches ?? []) {
    if (punch.jobId && punch.jobId !== job.jobId) continue;
    if (punch.type === "site_in") add({ id: `punch-${punch.punchId}`, at: punch.at, kind: "arrive", title: "Arrived at the job", by: punch.workerName });
    if (punch.type === "site_out") add({ id: `punch-${punch.punchId}`, at: punch.at, kind: "depart", title: "Left the job", by: punch.workerName });
  }

  for (const update of src.updates ?? []) {
    add({ id: `update-${update.updateId}`, at: update.createdAt, kind: "field",
      title: update.kind === "correction" ? "Correction" : "Field update", by: update.submittedBy,
      detail: clip(update.rawTextEn ?? update.rawText, 200) });
  }

  for (const photo of src.photos ?? []) {
    add({ id: `photo-${photo.photoId}`, at: photo.createdAt, kind: "photo", title: "Photo added", by: photo.uploadedBy, detail: clip(photo.label, 120) });
  }

  for (const finding of job.findings ?? []) {
    add({ id: `finding-${finding.findingId}`, at: finding.addedAt, kind: "finding", title: "Finding added", detail: clip(finding.problem, 160) });
  }

  const quote = src.quote;
  if (quote) {
    add({ id: `quote-${quote.quoteId}-created`, at: quote.createdAt, kind: "quote", title: `Quote ${quote.quoteId} drafted` });
    if (isTime(quote.sentAt)) add({ id: `quote-${quote.quoteId}-sent`, at: quote.sentAt, kind: "quote", title: "Quote sent", detail: quote.sentTo });
    if (quote.status === "accepted" || quote.status === "declined" || quote.status === "expired") {
      add({ id: `quote-${quote.quoteId}-answer`, at: quote.updatedAt, kind: "quote", title: `Quote ${quote.status}` });
    }
  }

  const invoice = src.invoice;
  if (invoice) {
    add({ id: `inv-${invoice.invoiceId}-created`, at: invoice.createdAt, kind: "invoice", title: `Invoice ${invoice.invoiceId} created` });
    if (isTime(invoice.sentAt)) add({ id: `inv-${invoice.invoiceId}-sent`, at: invoice.sentAt, kind: "invoice", title: "Invoice sent", detail: invoice.sentTo });
  }

  return events.sort((a, b) => a.at - b.at || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.id.localeCompare(b.id));
}
