"use client";

import { useRef, type ReactNode } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Generic reusable bottom-sheet shell (backdrop, drag handle, title, Escape and
 * click-outside to dismiss) — the mobile-appropriate sibling of Modal.tsx's centered dialog.
 * New mobile-style popups should use this instead of hand-rolling another
 * "position: fixed; inset: 0; align-items: flex-end" (PhotoCapture's own upload prompt and the
 * job-photo lightbox both predate this). Same focus contract as Modal (T-114).
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(open, panelRef, { onEscape: onClose });

  if (!open) return null;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <p className="sheet-title">{title}</p>
        {children}
      </div>
    </div>
  );
}
