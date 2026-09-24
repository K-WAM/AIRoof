"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

interface Options {
  /** Called on Escape. Read through a ref, so inline closures don't re-run the trap. */
  onEscape?: () => void;
  /**
   * "container" (default) focuses the panel itself — right for dialogs whose
   * first control shouldn't be a header close button. "first" focuses the first
   * focusable element, for disclosure-style panels like the mobile nav sheet.
   */
  initialFocus?: "container" | "first";
  /**
   * Return focus to the previously-focused element on close (default true).
   * Set false when closing because the user navigated — focus should follow
   * the navigation, not snap back to the trigger.
   */
  returnFocus?: boolean;
}

/**
 * Shared dialog/disclosure focus behavior (T-114): focus moves into the
 * container while it is open, Tab/Shift+Tab cycle inside it, Escape closes,
 * and focus returns to whatever was focused before it opened. Used by
 * Modal.tsx, Sheet.tsx and the company shell's mobile nav sheet.
 */
export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  { onEscape, initialFocus = "container", returnFocus = true }: Options = {},
) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  const returnFocusRef = useRef(returnFocus);
  returnFocusRef.current = returnFocus;

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    const panel: HTMLElement = container;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (!panel.contains(document.activeElement)) {
      const first = initialFocus === "first"
        ? panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
        : null;
      (first ?? panel).focus();
    }

    const focusables = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onEscapeRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = active instanceof HTMLElement && panel.contains(active);

      if (e.shiftKey) {
        if (!inside || active === first || active === container) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (returnFocusRef.current && previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [active, containerRef, initialFocus]);
}
