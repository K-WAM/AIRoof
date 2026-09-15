// Phase 12, Phase 5 — Time clock. See docs/PLATFORM-EXPANSION-PLAN.md's "Phase 5" section for
// the full design (the state machine, the cross-job guard, the projection-merge rule).
//
// Punches are an immutable, append-only edge ledger — exactly the same event-sourcing pattern
// `src/types/jobs.ts`'s FieldUpdate/`buildProjection` already uses for job data. An edit never
// mutates a punch; it appends a new one carrying `supersedes`, and the fold ignores whatever it
// supersedes. Business-level (not nested under a job), because office time has no job and the
// cross-job guard needs "does this worker have an open site punch anywhere" in one query.

export type PunchType =
  | "office_in"    // Arrived Office  — paid day starts
  | "site_in"      // Arrived Jobsite — job-scoped clock starts
  | "break_start"  // Lunch Break     — pauses whichever clock is running
  | "break_end"    // Back from Lunch
  | "site_out"     // Left Jobsite
  | "office_out";  // Left Office     — paid day ends

export type ClockState = "off" | "office" | "site" | "break_office" | "site_break";

export type PunchSource = "field-app" | "admin-edit" | "auto-close";

export interface Punch {
  punchId: string;      // `pn_${at}_${rand4}`
  businessId: string;
  workerKey: string;    // `uid:${uid}` for accounts; `name:${normalizeName(name)}` for QR crew
  workerName: string;
  type: PunchType;
  jobId?: string;        // required for site_in/site_out
  at: number;
  dayKey: string;        // business-tz local date, from @/lib/format's dayKey()
  source: PunchSource;
  editedBy?: string;
  editedAt?: number;
  supersedes?: string;   // append-only edits: the punchId this one replaces
  note?: string;
  createdAt: number;
}

export type AnomalyType = "missing_out" | "over_16h" | "overlap";

export interface WorkerDayAnomaly {
  type: AnomalyType;
  jobId?: string;
  detail: string;
}

export interface WorkerDayJobTime {
  ms: number;
  arrivalTime?: string;  // fmtTime-formatted, first arrival for this job this day
  departureTime?: string; // fmtTime-formatted, last departure for this job this day
}

/** One worker's folded state for one business-local calendar day. */
export interface WorkerDay {
  workerKey: string;
  workerName: string;
  dayKey: string;
  state: ClockState;
  openJobId?: string;     // set when state is "site" or "site_break"
  openSince?: number;     // when the CURRENT state started accruing (office or site)
  officeMs: number;       // paid, non-job time accrued so far this day
  jobs: Record<string, WorkerDayJobTime>; // per-jobId accrued site time this day
  anomalies: WorkerDayAnomaly[];
  lastPunchAt?: number;
  lastPunchType?: PunchType;
}

/** One line of punch-derived labor for a single job, ready to merge into a job's projection. */
export interface PunchedLaborEntry {
  workerKey: string;
  workerName: string;
  dayKey: string;
  hours: number;
  arrivalTime?: string;
  departureTime?: string;
}
