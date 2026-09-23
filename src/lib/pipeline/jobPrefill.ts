// Pure, unit-tested URL builder for the Pipeline → Jobs "Create <jobNoun>"
// prefill handshake. Both entry points (Appointment cards and the Lead
// detail) call this one function so the two can never drift apart about
// which query params the Jobs page reads.
//
// The Jobs page (src/app/company/jobs/page.tsx) reads clientName,
// clientPhone, address, serviceType, notes, and opens the form when either
// appointmentId (appointment provenance) or leadId (lead provenance) is
// present. The values are flat point-in-time copies of the source entity —
// the customer-snapshot rule: Job.clientName/clientPhone/address are never
// rewired back to the lead/appointment afterwards.
//
// T-100: structured intake is carried into the job's notes as "Label: value"
// lines (same parseable shape the phone agent writes), rendered with the
// vertical template's labels via `intakeFields`.

import type { IntakeField } from "@/lib/verticals/templates";

export interface JobPrefillFields {
  clientName?: string;
  clientPhone?: string;
  address?: string;
  serviceType?: string;
  notes?: string;
  /** Structured per-industry intake (T-100) — appended to notes as "Label: value" lines. */
  intake?: Record<string, string>;
  /** The business's template intake fields, supplying `intake`'s labels. */
  intakeFields?: readonly IntakeField[];
  /** Appointment provenance — also the Jobs form's auto-open trigger. */
  appointmentId?: string;
  /** Lead provenance — the Jobs form's auto-open trigger for leads. */
  leadId?: string;
  /** Superadmin ?preview= context, preserved across the navigation. */
  preview?: string;
}

/** Render an intake map as "Label: value" lines using the template's labels. */
export function formatIntakeLines(
  intake: Record<string, string> | undefined,
  fields: readonly IntakeField[] | undefined
): string[] {
  if (!intake) return [];
  const labelByKey = new Map((fields ?? []).map((field) => [field.key, field.label]));
  return Object.entries(intake)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => `${labelByKey.get(key) ?? key}: ${value}`);
}

export function buildJobPrefillUrl(fields: JobPrefillFields): string {
  const params = new URLSearchParams();
  params.set("clientName", fields.clientName ?? "");
  params.set("clientPhone", fields.clientPhone ?? "");
  params.set("address", fields.address ?? "");
  params.set("serviceType", fields.serviceType ?? "");
  const intakeLines = formatIntakeLines(fields.intake, fields.intakeFields);
  const notes = [fields.notes, ...intakeLines]
    .filter((line) => line && line.trim().length > 0)
    .join("\n");
  if (notes) params.set("notes", notes);
  if (fields.appointmentId) params.set("appointmentId", fields.appointmentId);
  if (fields.leadId) params.set("leadId", fields.leadId);
  if (fields.preview) params.set("preview", fields.preview);
  return `/company/jobs?${params.toString()}#new`;
}
