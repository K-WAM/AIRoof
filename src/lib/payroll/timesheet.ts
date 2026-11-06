import { summarizePayroll } from "./summary";
import type { PayrollSummary } from "@/types/payroll";
import type { Punch, WorkerDay } from "@/types/timeclock";

export type PayrollPunch = Pick<Punch, "workerKey" | "dayKey" | "type" | "at" | "jobId">;
export type PayrollView = PayrollSummary & { capped?: boolean; timezone: string; days: WorkerDay[]; punches: PayrollPunch[] };

export function periodDates(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let at = Date.parse(`${start}T12:00:00Z`); at <= Date.parse(`${end}T12:00:00Z`) && dates.length < 31; at += 86400000) dates.push(new Date(at).toISOString().slice(0, 10));
  return dates;
}

/** Local-only example. Uses the same weekly overtime calculation as recorded hours. */
export function examplePayroll(start: string): PayrollView {
  const monday = new Date(`${start}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const first = monday.toISOString().slice(0, 10);
  const last = new Date(monday.getTime() + 6 * 86400000).toISOString().slice(0, 10);
  const days: WorkerDay[] = [], punches: PayrollPunch[] = [];
  for (const [workerKey, workerName, hours] of [["sample-jordan", "Jordan Example", [8, 8, 8, 8, 8, 2, 0]], ["sample-robin", "Robin Sample", [8, 8, 8, 8, 6, 0, 0]]] as const) {
    periodDates(first, last).forEach((dayKey, i) => {
      const h = hours[i];
      days.push({ workerKey, workerName, dayKey, state: "off", officeMs: 0, jobs: h ? { "SAMPLE-JOB": { ms: h * 3600000 } } : {}, anomalies: [] });
      if (h) {
        const at = Date.parse(`${dayKey}T08:00:00Z`);
        punches.push({ workerKey, dayKey, type: "site_in", at, jobId: "SAMPLE-JOB" }, { workerKey, dayKey, type: "site_out", at: at + h * 3600000, jobId: "SAMPLE-JOB" });
      }
    });
  }
  return { ...summarizePayroll(days, { periodStart: first, periodEnd: last }), timezone: "UTC", days, punches };
}
