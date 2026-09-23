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

export interface JobPrefillFields {
  clientName?: string;
  clientPhone?: string;
  address?: string;
  serviceType?: string;
  notes?: string;
  /** Appointment provenance — also the Jobs form's auto-open trigger. */
  appointmentId?: string;
  /** Lead provenance — the Jobs form's auto-open trigger for leads. */
  leadId?: string;
  /** Superadmin ?preview= context, preserved across the navigation. */
  preview?: string;
}

export function buildJobPrefillUrl(fields: JobPrefillFields): string {
  const params = new URLSearchParams();
  params.set("clientName", fields.clientName ?? "");
  params.set("clientPhone", fields.clientPhone ?? "");
  params.set("address", fields.address ?? "");
  params.set("serviceType", fields.serviceType ?? "");
  if (fields.notes) params.set("notes", fields.notes);
  if (fields.appointmentId) params.set("appointmentId", fields.appointmentId);
  if (fields.leadId) params.set("leadId", fields.leadId);
  if (fields.preview) params.set("preview", fields.preview);
  return `/company/jobs?${params.toString()}#new`;
}
