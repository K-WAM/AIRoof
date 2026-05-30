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
  in_progress:   "In Progress",
  complete:      "Complete",
  after_hours:   "After hrs",
  emergency:     "Emergency",
  scheduling:    "Scheduling",
  service:       "Service Q",
  general:       "General",
  outbound:      "Outbound",
};

export function StatusChip({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`sc sc--${status}`}>
      {label ?? STATUS_LABEL[status] ?? status}
    </span>
  );
}
