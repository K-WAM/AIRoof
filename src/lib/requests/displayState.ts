export type DisplayTone = "neutral" | "info" | "warn" | "success" | "danger";
export interface RequestDisplayInput {
  status?: string | null;
  pendingConfirmation?: boolean;
  confirmationFailed?: boolean;
  jobId?: string | null;
  startTime?: number | null;
  bookedAfterHours?: boolean;
  outcome?: string | null;
}
export interface RequestDisplayState {
  label: string;
  whatHappened: string;
  nextAction: string;
  tone: DisplayTone;
}

/** Presentation only: persisted request, booking and appointment fields keep their existing meaning. */
export function displayRequestState(input: RequestDisplayInput, now = Date.now()): RequestDisplayState {
  if (input.jobId) return { label: "Job created", whatHappened: "The request became a job.", nextAction: "Open job", tone: "success" };
  if (input.status === "cancelled" || input.status === "lost" || input.status === "declined") {
    return { label: "Declined", whatHappened: "The request was declined or cancelled.", nextAction: "Review details", tone: "neutral" };
  }
  if (input.confirmationFailed) return { label: "Confirmation failed", whatHappened: "The booking was not confirmed.", nextAction: "Retry confirmation", tone: "danger" };
  if (input.startTime && input.startTime < now) {
    return { label: "Past booking", whatHappened: "The requested time has passed.", nextAction: "Call back to agree a new time", tone: "warn" };
  }
  if (input.status === "confirmed") return { label: "Confirmed", whatHappened: "The office confirmed the booking.", nextAction: "Assign or create job", tone: "success" };
  if (input.pendingConfirmation || input.status === "requested" || input.status === "booked" || input.outcome === "scheduled") {
    return { label: "Booking", whatHappened: input.bookedAfterHours ? "The caller chose a time outside business hours." : "The caller chose a time; the office has not confirmed it.", nextAction: "Confirm booking", tone: "warn" };
  }
  if (input.status === "contacted") return { label: "Callback", whatHappened: "The office contacted the caller.", nextAction: "Review request", tone: "info" };
  if (input.status === "new" || input.outcome === "lead_captured" || input.outcome === "escalated") return { label: "Request", whatHappened: "The AI captured a request from the call.", nextAction: "Review request", tone: "info" };
  return { label: "Callback", whatHappened: "The call needs office follow-up.", nextAction: "Call back", tone: "neutral" };
}
