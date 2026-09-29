"use client";

import { createElement } from "react";

interface PageErrorProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function PageError({
  title = "Failed to load this page",
  message,
  onRetry,
}: PageErrorProps) {
  return createElement(
    "section",
    {
      className: "panel",
      role: "alert",
      style: {
        borderColor: "var(--danger)",
        background: "var(--surface)",
        padding: "var(--sp-5, 24px)",
      },
    },
    createElement(
      "h1",
      { style: { margin: "0 0 var(--sp-2, 8px)", color: "var(--danger)", fontSize: 20 } },
      title
    ),
    createElement(
      "p",
      { style: { margin: 0, color: "var(--text-muted)", fontSize: 14 } },
      message
    ),
    onRetry
      ? createElement(
          "button",
          {
            className: "button secondary",
            type: "button",
            onClick: onRetry,
            style: { marginTop: "var(--sp-4, 16px)" },
          },
          "Try again"
        )
      : null
  );
}
