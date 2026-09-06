"use client";

// Reusable on/off switch for persisted binary settings (a day marked Closed, a
// photo flagged for the report, etc). Not for multi-item checklists/consent
// lists — those stay native checkboxes, which are the correct control there.
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  size = "md",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name. Omit only when a visible adjacent label already names the control. */
  label?: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`toggle${size === "sm" ? " toggle-sm" : ""}${checked ? " is-on" : ""}`}
    >
      <span className="toggle-thumb" />
    </button>
  );
}
