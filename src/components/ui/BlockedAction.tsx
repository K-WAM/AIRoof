"use client";

import { AlertCircle } from "lucide-react";
import Link from "next/link";

interface BlockedActionProps {
  /** Plain-language explanation of what's missing and why (e.g. "No crews yet — add one to start scheduling."). */
  message: string;
  actionLabel: string;
  onAction?: () => void;
  /** Use a direct destination when the prerequisite cannot be fixed in place. */
  href?: string;
  /**
   * Optional second line spelling out why the action is blocked (T-163). It is
   * always rendered as visible text — a blocked action never hides its reason
   * in a tooltip.
   */
  reason?: string;
}

/**
 * Inline "add X first" prompt for a workflow that's genuinely blocked on a
 * missing prerequisite. Resolves the blocker in place — the action button
 * opens the relevant quick-add form right where you are — instead of a plain
 * link that bounces you off the page to go find and guess at the right one.
 */
export function BlockedAction({ message, actionLabel, onAction, href, reason }: BlockedActionProps) {
  return (
    <div className="blocked-action" role="status">
      <AlertCircle size={20} strokeWidth={1.75} className="blocked-action-icon" />
      <p className="blocked-action-text">{message}</p>
      {reason && <p className="blocked-action-reason">{reason}</p>}
      {href ? <Link className="button primary small" href={href}>{actionLabel}</Link> : (
        <button type="button" className="button primary small" onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  );
}
