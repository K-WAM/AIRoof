/**
 * Every status maps to exactly one semantic tone; the tone is the only thing
 * that decides colour (T-157, C-D). Unknown statuses fall back to "neutral"
 * rather than a bespoke colour, so a new status can never invent a palette.
 */
export type StatusTone = "danger" | "success" | "info" | "warn" | "neutral";

const STATUS_TONE: Record<string, StatusTone> = {
  scheduled:     "success",
  escalated:     "danger",
  lead_captured: "info",
  no_action:     "neutral",
  urgent:        "danger",
  normal:        "neutral",
  new:           "info",
  contacted:     "neutral",
  converted:     "success",
  lost:          "neutral",
  confirmed:     "success",
  requested:     "warn",
  cancelled:     "danger",
  open:          "info",
  inspection:    "info",
  quoted:        "warn",
  in_progress:   "warn",
  invoiced:      "info",
  complete:      "success",
  pending:       "warn",
  after_hours:   "warn",
  emergency:     "danger",
  scheduling:    "success",
  service:       "neutral",
  general:       "neutral",
  outbound:      "success",
};

const STATUS_LABEL: Record<string, string> = {
  scheduled:     "Booked",
  escalated:     "Escalated",
  lead_captured: "Lead",
  no_action:     "No action",
  urgent:        "Urgent",
  normal:        "Normal",
  new:           "New",
  contacted:     "Contacted",
  converted:     "Converted",
  lost:          "Lost",
  confirmed:     "Confirmed",
  requested:     "Requested",
  cancelled:     "Cancelled",
  open:          "Open",
  inspection:    "Inspection",
  quoted:        "Quoted",
  in_progress:   "In Progress",
  invoiced:      "Invoiced",
  complete:      "Complete",
  pending:       "Pending",
  after_hours:   "After hrs",
  emergency:     "Emergency",
  scheduling:    "Scheduling",
  service:       "Service Q",
  general:       "General",
  outbound:      "Outbound",
};

export function StatusChip({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONE[status] ?? "neutral";
  return (
    <span className={`sc sc--${tone}`} data-status={status}>
      {label ?? STATUS_LABEL[status] ?? status}
    </span>
  );
}
