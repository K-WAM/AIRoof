// Payroll overview math (T-285, Roof Doctors plan §7) — a PREVIEW: hours from time-clock punches, overtime above
// 40 h per ISO week (Mon-Sun), estimated gross = regular x rate + overtime x rate x 1.5. Never approves or pays anything.
// A week cut by the period edge counts only the days inside the period.
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
  const workers = new Map<string, { name: string; weeks: Map<string, number>; days: number; jobs: Set<string>; flags: Set<string> }>();
  const labels = { missing_out: "Missing clock-out", over_16h: "Over 16 hours", overlap: "Overlapping punches" };
  for (const day of days) {
    if (day.dayKey < opts.periodStart || day.dayKey > opts.periodEnd) continue;
    const worker = workers.get(day.workerKey) ?? { name: day.workerName, weeks: new Map<string, number>(), days: 0, jobs: new Set<string>(), flags: new Set<string>() };
    const date = new Date(`${day.dayKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const week = date.toISOString().slice(0, 10);
    const ms = day.officeMs + Object.values(day.jobs).reduce((sum, job) => sum + job.ms, 0);
    worker.weeks.set(week, (worker.weeks.get(week) ?? 0) + ms);
    if (ms > 0) worker.days++;
    for (const id of Object.keys(day.jobs)) worker.jobs.add(id);
    for (const anomaly of day.anomalies) worker.flags.add(labels[anomaly.type]);
    workers.set(day.workerKey, worker);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  const people = [...workers].map(([workerKey, worker]) => {
    let regular = 0, overtime = 0;
    for (const ms of worker.weeks.values()) { const hours = ms / 3600000; regular += Math.min(hours, opts.overtimeAfterWeeklyHours ?? 40); overtime += Math.max(0, hours - (opts.overtimeAfterWeeklyHours ?? 40)); }
    const rate = opts.rates?.[workerKey];
    return { workerKey, name: worker.name, ...(opts.crews?.[workerKey] !== undefined ? { crew: opts.crews[workerKey] } : {}), regularHours: round(regular), overtimeHours: round(overtime), days: worker.days, jobs: worker.jobs.size, flags: [...worker.flags], ...(rate !== undefined ? { hourlyRate: rate, estimatedGross: round(regular * rate + overtime * rate * 1.5) } : {}) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const totals: PayrollSummary["totals"] = { regularHours: round(people.reduce((n, p) => n + p.regularHours, 0)), overtimeHours: round(people.reduce((n, p) => n + p.overtimeHours, 0)) };
  if (people.length > 0 && people.every(p => p.estimatedGross !== undefined)) totals.estimatedGross = people.reduce((n, p) => n + Math.round(p.estimatedGross! * 100), 0) / 100;
  return { periodStart: opts.periodStart, periodEnd: opts.periodEnd, people, totals };
}
