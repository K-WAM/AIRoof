"use client";

import { useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Rendered before the title (e.g. a "back to menu" arrow for a multi-step modal). */
  headerLeft?: ReactNode;
}

/**
 * Generic reusable modal shell (backdrop, header with title + close, Escape
 * and click-outside to dismiss). Every ad hoc "position: fixed; inset: 0"
 * popup in this app (Field QR, the job-photo lightbox) predates this — new
 * modal UIs should use it instead of hand-rolling another one.
 *
 * Focus behavior (T-114) lives in useFocusTrap: focus enters the panel, Tab
 * cycles inside it, and it returns to the trigger on close. A child with
 * autoFocus keeps focus instead of the panel stealing it.
 */
export function Modal({ open, onClose, title, children, headerLeft }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(open, panelRef, { onEscape: onClose });

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        className="modal-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          {headerLeft}
          <h2 id={titleId} className="modal-title">{title}</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
