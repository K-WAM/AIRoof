// Payroll overview (Roof Doctors plan §7, T-285) — a PREVIEW: computed from time-clock punches, never approved or paid
// from the app. Computed by src/lib/payroll/summary.ts (pure), shown by /company/payroll.

export interface PayrollPerson {
  workerKey: string;
  name: string;
  crew?: string;
  regularHours: number;
  overtimeHours: number;
  days: number;
  jobs: number;
  /** Plain-words flags, e.g. "Missing clock-out". */
  flags: string[];
  hourlyRate?: number;
  /** Only when hourlyRate is known: regular x rate + overtime x rate x 1.5, dollars. */
  estimatedGross?: number;
}

export interface PayrollSummary {
  /** YYYY-MM-DD, business-local */
  periodStart: string;
  /** YYYY-MM-DD, business-local, inclusive */
  periodEnd: string;
  people: PayrollPerson[];
  totals: { regularHours: number; overtimeHours: number; estimatedGross?: number };
}
