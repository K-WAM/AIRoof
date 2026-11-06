import { expect, it } from "vitest";
import { examplePayroll } from "../timesheet";

it("shows every day and uses weekly overtime only above forty hours", () => {
  const sample = examplePayroll("2026-11-06");
  expect(sample.periodStart).toBe("2026-11-02");
  expect(sample.periodEnd).toBe("2026-11-08");
  expect(sample.days).toHaveLength(14);
  expect(sample.people.map(p => [p.regularHours, p.overtimeHours])).toEqual([[40, 2], [38, 0]]);
  expect(sample.punches.every(p => p.jobId === "SAMPLE-JOB")).toBe(true);
});
