"use client";

interface PageErrorProps {
  /** What happened, in plain words. Never a raw exception or a provider message. */
  title?: string;
  /** One sentence about what could not be shown. */
  message: string;
  /** The one next step the user can take. */
  nextStep?: string;
  onRetry?: () => void;
}

/**
 * Full-page failure state (T-163). It states what happened, the one next step,
 * and a Retry — and never renders a raw error string or any customer data.
 * Callers own the wording so the same component reads naturally per screen.
 */
export function PageError({
  title = "Failed to load this page",
  message,
  nextStep = "Try again in a moment. If it keeps happening, tell the Luxor team from Help.",
  onRetry,
}: PageErrorProps) {
  return (
    <section className="panel page-error" role="alert">
      <h1 className="page-error-title">{title}</h1>
      <p className="page-error-message">{message}</p>
      <p className="page-error-next">{nextStep}</p>
      {onRetry && (
        <button className="button secondary" type="button" onClick={onRetry}>
          Retry
        </button>
      )}
    </section>
  );
}
