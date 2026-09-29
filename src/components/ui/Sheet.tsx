"use client";

import { useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { confirmDiscard, useFocusTrap } from "@/hooks/useFocusTrap";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /**
   * Optional (Phase 32, C-E): when true, Escape, the backdrop and the close
   * button ask "Discard changes?" instead of closing immediately. Absent/false
   * keeps today's behavior exactly.
   */
  dirty?: boolean;
}

/**
 * Generic reusable bottom-sheet shell (backdrop, drag handle, title, close,
 * Escape and click-outside to dismiss) — the mobile-appropriate sibling of
 * Modal.tsx's centered dialog. New mobile-style popups should use this instead
 * of hand-rolling another "position: fixed; inset: 0; align-items: flex-end"
 * (PhotoCapture's own upload prompt and the job-photo lightbox both predate
 * this). Same dialog and focus contract as Modal (T-114/T-158): labelled
 * dialog, focus the first field (else Close), Tab stays inside, scroll lock,
 * focus returns to the trigger.
 */
export function Sheet({ open, onClose, title, children, dirty }: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(open, panelRef, { onEscape: onClose, initialFocus: "field", dirty });

  function requestClose() {
    if (confirmDiscard(dirty)) onClose();
  }

  if (!open) return null;

  return (
    <div className="sheet-backdrop" onClick={requestClose}>
      <div
        ref={panelRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="sheet-head">
          <p className="sheet-title" id={titleId}>{title}</p>
          <button
            type="button"
            className="modal-close"
            data-dialog-close
            aria-label="Close"
            onClick={requestClose}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
