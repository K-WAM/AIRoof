"use client";

import { cloneElement, useId, type ReactElement } from "react";

interface ControlProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

interface FormFieldProps {
  /** Always rendered as a visible <label> (never a placeholder-only field). */
  label: string;
  /** Optional id for the control; generated when omitted. The label gets htmlFor. */
  id?: string;
  /** Optional one-line guidance under the label. */
  hint?: string;
  /** Validation message; wired to the control and announced as role="alert". */
  error?: string;
  /** The single control this field labels (input/select/textarea). */
  children: ReactElement<ControlProps>;
  /** Extra class on the wrapper (e.g. "full" for a full-width grid cell). */
  className?: string;
}

/**
 * Labelled form field (T-163): a visible label, an optional hint, and an error
 * that is programmatically associated with the control
 * (aria-describedby + aria-invalid) and announced with role="alert".
 * Additive — it renders existing controls, it does not replace the `.field`
 * markup pages already use.
 */
export function FormField({ label, id, hint, error, children, className }: FormFieldProps) {
  const autoId = useId();
  const controlId = id ?? children.props.id ?? autoId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = cloneElement(children, {
    id: controlId,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
  });

  return (
    <div className={`field${className ? ` ${className}` : ""}`}>
      <label htmlFor={controlId}>{label}</label>
      {hint && <p className="field-hint" id={hintId}>{hint}</p>}
      {control}
      {error && <p className="field-error" id={errorId} role="alert">{error}</p>}
    </div>
  );
}
