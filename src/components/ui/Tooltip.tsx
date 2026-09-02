"use client";

import { cloneElement, isValidElement, useId, useRef, useState, type ReactElement } from "react";

interface TooltipProps {
  /** Short, plain-language description of what the wrapped control does. */
  content: string;
  /** A single focusable/hoverable element — an icon-only button, a link, etc. */
  children: ReactElement;
  /** Delay before showing, in ms (T-066 spec: ~400-600ms). */
  delay?: number;
}

/**
 * A small, deliberately sparing hover/focus tooltip (T-066).
 *
 * Use this ONLY where a control's purpose isn't already obvious from a visible
 * label — an icon-only button, a truncated value. Never wrap a control that
 * already has visible text ("Sign out", "+ Manage crews") — that defeats the
 * point and adds noise. Guideline, not a mandate: apply it to a short, reviewed
 * list of controls, not every element in the app.
 *
 * - Shows after `delay` on hover or keyboard focus; hides instantly on
 *   mouse-leave/blur.
 * - Suppressed entirely on touch/no-hover devices via CSS (`@media (hover: none)`
 *   in globals.css), not JS device-sniffing — a tap that also focuses the
 *   control never shows one.
 * - `aria-describedby` is set on the actual trigger element (via cloneElement),
 *   not just a floating styled `<span>`, so screen readers get the same
 *   information sighted users do.
 * - Respects `prefers-reduced-motion` (the fade transition is dropped, not the
 *   tooltip itself).
 */
export function Tooltip({ content, children, delay = 500 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  function show() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(true), delay);
  }

  function hide() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  }

  const trigger = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, { "aria-describedby": id })
    : children;

  return (
    <span className="tooltip-wrap" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {trigger}
      <span role="tooltip" id={id} className={`tooltip-bubble${visible ? " tooltip-visible" : ""}`}>
        {content}
      </span>
    </span>
  );
}
