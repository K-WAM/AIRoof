"use client";

// The ONE number box for money and quantities. It keeps exactly what you typed ("12.", "0.5", an empty box) and
// reports a number only when the text is a real number — a box that re-formats on every keystroke drops the decimal
// point, and "12.50" became $1,250 in the Library (found 2026-10-04). Use this for every price, rate, quantity or %.

import { useEffect, useState, type CSSProperties } from "react";

export function NumberField({ value, onCommit, onBlur, label, width, disabled, min = 0, max, step = "0.01", placeholder, style, className }: {
  value: number;
  onCommit: (n: number) => void;
  /** Runs after the box loses focus (e.g. "save now"); an empty box snaps back to the last good number first. */
  onBlur?: () => void;
  label: string;
  width?: number;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: string;
  placeholder?: string;
  style?: CSSProperties;
  className?: string;
}) {
  const [text, setText] = useState(value ? String(value) : "");
  useEffect(() => { if (text.trim() === "" ? value !== 0 : Number(text) !== value) setText(value ? String(value) : ""); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input aria-label={label} type="text" inputMode="decimal" autoComplete="off" disabled={disabled} value={text} placeholder={placeholder ?? "0"}
      className={className} style={{ ...(width ? { width } : {}), ...style }}
      onChange={(e) => {
        // Digits and one dot only (a pasted "$1,250.00" becomes 1250.00).
        const cleaned = e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
        setText(cleaned);
        const n = Number(cleaned);
        if (cleaned.trim() !== "" && cleaned !== "." && Number.isFinite(n) && n >= min && (max === undefined || n <= max)) onCommit(n);
      }}
      // Leaving the box tidies it: "12." → "12", an emptied or out-of-range box goes back to the last good number.
      onBlur={() => { setText(value ? String(value) : ""); onBlur?.(); }}
    />
  );
}
