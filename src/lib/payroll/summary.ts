// STUB (Wave 0, Roof Doctors plan §7). Final signature, empty result — so the Payroll screen (stream K2) can be
// built before the real math (stream K3) merges. K3 replaces the body and keeps this export and signature exactly.
import type { PayrollSummary } from "@/types/payroll";
import type { WorkerDay } from "@/types/timeclock";

export interface PayrollOptions {
  /** YYYY-MM-DD */
  periodStart: string;
  /** YYYY-MM-DD, inclusive */
  periodEnd: string;
  /** workerKey -> hourly rate (dollars). */
  rates?: Record<string, number>;
  /** Overtime above this many hours per ISO week. Default 40. */
  overtimeAfterWeeklyHours?: number;
  /** workerKey -> crew name, for display. */
  crews?: Record<string, string>;
}

export function summarizePayroll(days: WorkerDay[], opts: PayrollOptions): PayrollSummary {
  void days;
  return {
    periodStart: opts.periodStart,
    periodEnd: opts.periodEnd,
    people: [],
    totals: { regularHours: 0, overtimeHours: 0 },
  };
}
