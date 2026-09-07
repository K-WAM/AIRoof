"use client";

import { AlertCircle } from "lucide-react";

interface BlockedActionProps {
  /** Plain-language explanation of what's missing and why (e.g. "No crews yet — add one to start scheduling."). */
  message: string;
  actionLabel: string;
  onAction: () => void;
}

/**
 * Inline "add X first" prompt for a workflow that's genuinely blocked on a
 * missing prerequisite. Resolves the blocker in place — the action button
 * opens the relevant quick-add form right where you are — instead of a plain
 * link that bounces you off the page to go find and guess at the right one.
 */
export function BlockedAction({ message, actionLabel, onAction }: BlockedActionProps) {
  return (
    <div className="blocked-action" role="status">
      <AlertCircle size={20} strokeWidth={1.75} className="blocked-action-icon" />
      <p className="blocked-action-text">{message}</p>
      <button type="button" className="button primary small" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}
