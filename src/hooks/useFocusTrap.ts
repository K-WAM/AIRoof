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
   * "field" focuses the first form field, else the element marked
   * data-dialog-close — the dialog contract (T-158).
   */
  initialFocus?: "container" | "first" | "field";
  /**
   * Return focus to the previously-focused element on close (default true).
   * Set false when closing because the user navigated — focus should follow
   * the navigation, not snap back to the trigger.
   */
  returnFocus?: boolean;
  /**
   * When true, Escape asks "Discard changes?" first and stays open if the user
   * cancels. The same guard is exported as `confirmDiscard` so backdrop/close
   * clicks behave identically (T-158).
   */
  dirty?: boolean;
}

/** True when it is safe to dismiss. A clean dialog always is; a dirty one asks. */
export function confirmDiscard(dirty: boolean | undefined): boolean {
  if (!dirty) return true;
  if (typeof window === "undefined" || typeof window.confirm !== "function") return false;
  return window.confirm("Discard changes?");
}

/**
 * Shared dialog/disclosure focus behavior (T-114): focus moves into the
 * container while it is open, Tab/Shift+Tab cycle inside it, Escape closes,
 * and focus returns to whatever was focused before it opened. Used by
 * Modal.tsx, Sheet.tsx and the company shell's mobile nav sheet.
 */
const FIRST_FIELD_SELECTOR = [
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
].join(", ");

export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  { onEscape, initialFocus = "container", returnFocus = true, dirty }: Options = {},
) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  const returnFocusRef = useRef(returnFocus);
  returnFocusRef.current = returnFocus;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

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
        : initialFocus === "field"
          ? panel.querySelector<HTMLElement>(FIRST_FIELD_SELECTOR)
            ?? panel.querySelector<HTMLElement>("[data-dialog-close]")
          : null;
      (first ?? panel).focus();
    }

    // Body scroll lock: the page behind an open dialog must not scroll (T-158).
    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    const focusables = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (confirmDiscard(dirtyRef.current)) onEscapeRef.current?.();
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
      body.style.overflow = previousOverflow;
      if (returnFocusRef.current && previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [active, containerRef, initialFocus]);
}
