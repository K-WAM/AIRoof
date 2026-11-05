// Exactly the job ids the visible Pipeline requests link to (T-317). A booking may carry its own jobId; a lead may
// already have one, or point at the job made from its call's booking (the same link the card shows). Returns unique
// ids so the page can batch-read only those jobs' companies instead of the newest 100 jobs.

type LeadRef = { jobId?: string; sourceCallId?: string };
type AppointmentRef = { jobId?: string; sourceCallId?: string };

export function linkedJobIds(leads: readonly LeadRef[], appointments: readonly AppointmentRef[]): string[] {
  const ids = new Set<string>();
  const jobByCall = new Map<string, string>();
  for (const appointment of appointments) {
    if (!appointment.jobId) continue;
    ids.add(appointment.jobId);
    if (appointment.sourceCallId && !jobByCall.has(appointment.sourceCallId)) jobByCall.set(appointment.sourceCallId, appointment.jobId);
  }
  for (const lead of leads) {
    if (lead.jobId) ids.add(lead.jobId);
    else if (lead.sourceCallId) {
      const jobId = jobByCall.get(lead.sourceCallId);
      if (jobId) ids.add(jobId);
    }
  }
  return [...ids];
}
