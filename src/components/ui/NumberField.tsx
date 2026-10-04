"use client";

// The ONE number box for money and quantities. It keeps exactly what you typed ("12.", "0.5", an empty box) and
// reports a number only when the text is a real number — a box that re-formats on every keystroke drops the decimal
// point, and "12.50" became $1,250 in the Library (found 2026-10-04). Use this for every price, rate, quantity or %.

import { useEffect, useState, type CSSProperties } from "react";

export function NumberField({ value, onCommit, onClear, onBlur, label, width, disabled, min = 0, max, placeholder, style, className }: {
  /** Undefined = no number yet (shows the placeholder). */
  value: number | undefined;
  onCommit: (n: number) => void;
  /** For optional fields: emptying the box clears the value instead of keeping the last number. */
  onClear?: () => void;
  /** Runs after the box loses focus (e.g. "save now"); an empty box snaps back to the last good number first. */
  onBlur?: () => void;
  label: string;
  width?: number;
  disabled?: boolean;
  min?: number;
  max?: number;
  /** Accepted for call-site compatibility; the box is text with a decimal keypad, so it has no effect. */
  step?: string;
  placeholder?: string;
  style?: CSSProperties;
  className?: string;
}) {
  const show = (v: number | undefined) => (v ? String(v) : v === 0 && onClear ? "0" : "");
  const [text, setText] = useState(show(value));
  useEffect(() => { if (text.trim() === "" ? value !== undefined && value !== 0 : Number(text) !== value) setText(show(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input aria-label={label} type="text" inputMode="decimal" autoComplete="off" disabled={disabled} value={text} placeholder={placeholder ?? "0"}
      className={className} style={{ ...(width ? { width } : {}), ...style }}
      onChange={(e) => {
        // Digits and one dot only (a pasted "$1,250.00" becomes 1250.00).
        const cleaned = e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
        setText(cleaned);
        const n = Number(cleaned);
        if (cleaned.trim() !== "" && cleaned !== "." && Number.isFinite(n) && n >= min && (max === undefined || n <= max)) onCommit(n);
        else if (cleaned.trim() === "" && onClear) onClear();
      }}
      // Leaving the box tidies it: "12." → "12", an emptied or out-of-range box goes back to the last good number.
      onBlur={() => { setText(show(value)); onBlur?.(); }}
    />
  );
}
