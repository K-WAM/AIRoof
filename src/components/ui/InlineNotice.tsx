"use client";

interface InlineNoticeProps {
  /** When the currently-shown data was loaded (ms). Renders as a local time. */
  at?: number | null;
  /** Overrides the default sentence about a failed background refresh. */
  message?: string;
  onRetry?: () => void;
}

/**
 * Quiet banner for a failed *background* refresh (T-163). It sits above the
 * content that is already on screen and never replaces it: the user keeps
 * seeing the data that loaded, plus when it loaded, plus a Retry.
 */
export function InlineNotice({ at, message, onRetry }: InlineNoticeProps) {
  const when = at ? new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  const text = message
    ?? (when ? `Couldn't refresh — showing what was loaded at ${when}` : "Couldn't refresh — showing the last loaded data");

  return (
    <div className="inline-notice" role="status">
      <span>{text}</span>
      {onRetry && (
        <>
          <span aria-hidden="true"> · </span>
          <button type="button" className="inline-notice-retry" onClick={onRetry}>
            Retry
          </button>
        </>
      )}
    </div>
  );
}
