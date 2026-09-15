import { describe, it, expect } from "vitest";
import { foldPunches, punchedLaborForJob } from "@/lib/timeclock/fold";
import { dayKey } from "@/lib/format";
import type { Punch, PunchType } from "@/types/timeclock";

const TZ = "America/New_York";
const BIZ = "biz1";
const WORKER = "uid:kevin";

// A fixed morning in New York time, well clear of any DST boundary.
const DAY_START = Date.parse("2026-09-14T12:00:00Z"); // 8:00 AM ET
const HOUR = 3_600_000;

let seq = 0;
function punch(type: PunchType, atOffsetMs: number, opts: Partial<Punch> = {}): Punch {
  const at = DAY_START + atOffsetMs;
  seq += 1;
  return {
    punchId: opts.punchId ?? `pn_${at}_${seq}`,
    businessId: BIZ,
    workerKey: WORKER,
    workerName: "Kevin",
    type,
    at,
    dayKey: dayKey(at, TZ),
    source: "field-app",
    createdAt: at,
    ...opts,
  };
}

describe("foldPunches", () => {
  it("folds a plain office day", () => {
    const punches = [punch("office_in", 0), punch("office_out", 8 * HOUR)];
    const [day] = foldPunches(punches, DAY_START + 9 * HOUR, TZ);
    expect(day.state).toBe("off");
    expect(day.officeMs).toBe(8 * HOUR);
    expect(day.anomalies).toHaveLength(0);
  });

  it("drives straight to a jobsite with no office punch and ends off, not office", () => {
    const punches = [punch("site_in", 0, { jobId: "J-1" }), punch("site_out", 6 * HOUR, { jobId: "J-1" })];
    const [day] = foldPunches(punches, DAY_START + 7 * HOUR, TZ);
    expect(day.state).toBe("off");
    expect(day.jobs["J-1"].ms).toBe(6 * HOUR);
    expect(day.jobs["J-1"].arrivalTime).toBeTruthy();
    expect(day.jobs["J-1"].departureTime).toBeTruthy();
  });

  it("returns to office after a site visit when the day started at the office (auto-closing office_out first)", () => {
    const punches = [
      punch("office_in", 0),
      punch("site_in", HOUR, { jobId: "J-1" }), // implicitly closes office_in at the same ms
      punch("site_out", 5 * HOUR, { jobId: "J-1" }),
      punch("office_out", 6 * HOUR),
    ];
    const [day] = foldPunches(punches, DAY_START + 7 * HOUR, TZ);
    expect(day.state).toBe("off");
    expect(day.officeMs).toBe(1 * HOUR + 1 * HOUR); // 1h before the site visit + 1h after returning
    expect(day.jobs["J-1"].ms).toBe(4 * HOUR);
  });

  it("pauses the site clock for a lunch break and does not bill it", () => {
    const punches = [
      punch("site_in", 0, { jobId: "J-1" }),
      punch("break_start", 4 * HOUR, { jobId: "J-1" }),
      punch("break_end", 4.5 * HOUR, { jobId: "J-1" }),
      punch("site_out", 8.5 * HOUR, { jobId: "J-1" }),
    ];
    const [day] = foldPunches(punches, DAY_START + 9 * HOUR, TZ);
    // 4h before break + 4h after = 8h billable; the 0.5h break is never accrued.
    expect(day.jobs["J-1"].ms).toBe(8 * HOUR);
  });

  it("auto-emits break_end before a site_out that closes mid-break", () => {
    const punches = [
      punch("site_in", 0, { jobId: "J-1" }),
      punch("break_start", 4 * HOUR, { jobId: "J-1" }),
      punch("site_out", 4.5 * HOUR, { jobId: "J-1" }), // still "on break" when they leave
    ];
    const [day] = foldPunches(punches, DAY_START + 5 * HOUR, TZ);
    expect(day.state).toBe("off");
    expect(day.jobs["J-1"].ms).toBe(4 * HOUR); // the 0.5h break contributes nothing
  });

  it("flags a still-open past day as missing_out and closes it at the last punch, guessing no extra time", () => {
    const punches = [punch("site_in", 0, { jobId: "J-1" })]; // never closed
    // "now" is two real days later, in the SAME tz, so the punch's dayKey is unambiguously in the past.
    const nowMs = DAY_START + 48 * HOUR;
    const [day] = foldPunches(punches, nowMs, TZ);
    expect(day.anomalies.some((a) => a.type === "missing_out")).toBe(true);
    expect(day.jobs["J-1"].ms).toBe(0); // zero minutes guessed past the last real punch
  });

  it("accrues a still-open TODAY span live without flagging missing_out", () => {
    const punches = [punch("site_in", 0, { jobId: "J-1" })];
    const nowMs = DAY_START + 3 * HOUR; // still the same business-local day
    const [day] = foldPunches(punches, nowMs, TZ);
    expect(day.anomalies.some((a) => a.type === "missing_out")).toBe(false);
    expect(day.jobs["J-1"].ms).toBe(3 * HOUR);
    expect(day.openJobId).toBe("J-1");
  });

  it("clamps a single span over 16h and flags it", () => {
    // DAY_START is 8am ET, so a genuine 20h on-clock span would cross midnight into a
    // different dayKey (a separate scenario the cron handles, not this fold) — use a shift
    // that starts near midnight instead, so both punches land in the same calendar day.
    const lateStart = Date.parse("2026-09-14T05:30:00Z"); // 1:30 AM ET
    const punches: Punch[] = [
      { ...punch("office_in", 0), at: lateStart, dayKey: dayKey(lateStart, TZ) },
      { ...punch("office_out", 20 * HOUR), at: lateStart + 20 * HOUR, dayKey: dayKey(lateStart + 20 * HOUR, TZ) },
    ];
    const [day] = foldPunches(punches, lateStart + 21 * HOUR, TZ);
    expect(day.officeMs).toBe(16 * HOUR);
    expect(day.anomalies.some((a) => a.type === "over_16h")).toBe(true);
  });

  it("ignores a punch superseded by a later admin edit", () => {
    const original = punch("office_out", 4 * HOUR);
    const punches = [
      punch("office_in", 0),
      original,
      punch("office_out", 8 * HOUR, { supersedes: original.punchId, source: "admin-edit" }),
    ];
    const [day] = foldPunches(punches, DAY_START + 9 * HOUR, TZ);
    expect(day.officeMs).toBe(8 * HOUR);
  });

  it("keeps openJobId undefined once a site_out returns to office, so the guard never sees a stale job", () => {
    const punches = [punch("office_in", 0), punch("site_in", HOUR, { jobId: "J-1" }), punch("site_out", 3 * HOUR, { jobId: "J-1" })];
    const [day] = foldPunches(punches, DAY_START + 4 * HOUR, TZ);
    expect(day.state).toBe("office");
    expect(day.openJobId).toBeUndefined();
  });
});

describe("punchedLaborForJob", () => {
  it("flattens per-day job time across workers/days into invoice-ready entries", () => {
    const days = foldPunches(
      [punch("site_in", 0, { jobId: "J-1" }), punch("site_out", 5 * HOUR, { jobId: "J-1" })],
      DAY_START + 6 * HOUR,
      TZ,
    );
    const labor = punchedLaborForJob(days, "J-1");
    expect(labor).toHaveLength(1);
    expect(labor[0]).toMatchObject({ workerKey: WORKER, workerName: "Kevin", hours: 5 });
  });

  it("omits jobs with zero accrued time", () => {
    const days = foldPunches([punch("office_in", 0), punch("office_out", HOUR)], DAY_START + 2 * HOUR, TZ);
    expect(punchedLaborForJob(days, "J-1")).toHaveLength(0);
  });
});
