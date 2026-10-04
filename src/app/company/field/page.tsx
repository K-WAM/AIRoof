"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessTimezone } from "@/hooks/useBusinessTimezone";
import { PhotoCapture } from "@/components/field/PhotoCapture";
import { FieldFindingsButton } from "@/components/field/FindingPickerSheet";
import { TimeClock } from "@/components/field/TimeClock";
import { FieldNoteComposer, type SavedReceipt } from "@/components/field/FieldNoteComposer";
import { RecentNotes } from "@/components/field/RecentNotes";
import type { WorkerDay } from "@/types/timeclock";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import type { Job, FieldMaterial, FieldLaborEntry, FieldTimelineEvent } from "@/types/jobs";
import type { Crew } from "@/types/library";
import type { TimeBlock } from "@/types/schedule";
import { BookingDetails, type BookingDetailsValue } from "@/components/appointments/BookingDetails";
import { CalendarFeedLink } from "@/components/field/CalendarFeedLink";
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  MapPin,
  RefreshCw,
  X,
} from "lucide-react";

// ─── Job Selector ────────────────────────────────────────────────────────────

function JobSelector({
  jobs,
  loading,
  selectedId,
  onSelect,
  myCrewId,
}: {
  jobs: Job[];
  loading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  /** The signed-in person's crew: their crew's jobs are tagged so the right one is easy to spot. */
  myCrewId?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = jobs.find((j) => j.jobId === selectedId);

  // Nothing picked yet: show the jobs as a plain list under one question, no dropdown to discover (2026-10-04).
  if (!loading && !selected && jobs.length > 1) {
    return (
      <div style={{ width: "100%" }}>
        <p style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700, color: "#f8fafc" }}>Which job are you at?</p>
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, overflow: "hidden" }}>
          {jobs.map((job, i) => (
            <button key={job.jobId} type="button" onClick={() => onSelect(job.jobId)}
              style={{ width: "100%", textAlign: "left", padding: "14px 16px", background: "transparent", border: "none", borderBottom: i < jobs.length - 1 ? "1px solid #334155" : "none", cursor: "pointer", color: "#f8fafc" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 17, fontWeight: 900, color: "#f97316" }}>#{job.jobId}</span>
                {myCrewId && job.assignedCrewId === myCrewId && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "rgba(94,234,212,0.15)", color: "#5eead4" }}>Your crew</span>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{job.title}</div>
              {job.address && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{job.address}</div>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 16,
          padding: "14px 16px",
          textAlign: "left",
          cursor: "pointer",
          color: "#f8fafc",
        }}
      >
        {loading ? (
          <span style={{ color: "#64748b", fontSize: 15 }}>Loading jobs…</span>
        ) : selected ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#f97316", fontSize: 13, fontWeight: 700 }}>#</span>
              <span style={{ color: "#f97316", fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em" }}>
                {selected.jobId}
              </span>
              {open
                ? <ChevronUp size={18} strokeWidth={1.75} style={{ marginLeft: "auto", color: "#64748b" }} />
                : <ChevronDown size={18} strokeWidth={1.75} style={{ marginLeft: "auto", color: "#64748b" }} />}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#f8fafc", marginTop: 4 }}>{selected.title}</div>
            {selected.address && (
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                <MapPin size={12} strokeWidth={1.75} />
                {selected.address}
              </div>
            )}
          </>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#64748b", fontSize: 15 }}>
              {jobs.length === 0 ? "— No open jobs —" : "Tap to select a job…"}
            </span>
            {open
              ? <ChevronUp size={18} strokeWidth={1.75} style={{ color: "#64748b" }} />
              : <ChevronDown size={18} strokeWidth={1.75} style={{ color: "#64748b" }} />}
          </div>
        )}
      </button>

      {open && jobs.length > 0 && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
          />
          <div style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            zIndex: 50,
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          }}>
            {jobs.map((job, i) => (
              <button
                key={job.jobId}
                onClick={() => { onSelect(job.jobId); setOpen(false); }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "14px 16px",
                  background: "transparent",
                  border: "none",
                  borderBottom: i < jobs.length - 1 ? "1px solid #334155" : "none",
                  cursor: "pointer",
                  color: "#f8fafc",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#0f172a")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 17, fontWeight: 900, color: "#f97316" }}>#{job.jobId}</span>
                  {myCrewId && job.assignedCrewId === myCrewId && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "rgba(94,234,212,0.15)", color: "#5eead4" }}>Your crew</span>}
                  {job.jobId === selectedId && <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>Selected</span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#f8fafc", marginTop: 2 }}>
                  {job.title}
                </div>
                {job.address && (
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>{job.address}</div>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Job Log Card ─────────────────────────────────────────────────────────────

interface JobLogData {
  materials: FieldMaterial[];
  laborEntries: FieldLaborEntry[];
  timelineEvents: FieldTimelineEvent[];
  fieldNotes: string[];
  totalLaborHours: number;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function FieldPageContent() {
  const searchParams = useSearchParams();
  const hookBusinessId = useBusinessId();
  const businessId = searchParams?.get("businessId") ?? hookBusinessId;
  const prefillJobId = searchParams?.get("jobId") ?? "";
  const previewParam = searchParams?.get("preview");
  const { user } = useAuth();
  const tz = useBusinessTimezone();
  // Phase 12/Phase 7 — a real name (set at invite time) reads far better on
  // labor lines, punches, and attribution than an email address ever did.
  // Falls back to email for teammates invited before this field existed.
  const workerDisplayName = user?.displayName || user?.email || "";

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState(prefillJobId);
  const [inspectorCrew, setInspectorCrew] = useState<Crew | null>(null);
  const [scheduleAppointments, setScheduleAppointments] = useState<Array<BookingDetailsValue & { appointmentId: string; endTime?: number }>>([]);
  const [scheduleBlocks, setScheduleBlocks] = useState<TimeBlock[]>([]);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [blockFormOpen, setBlockFormOpen] = useState(false);
  const [blockLabel, setBlockLabel] = useState("Site visit");
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [jobLogData, setJobLogData] = useState<JobLogData>({
    materials: [],
    laborEntries: [],
    timelineEvents: [],
    fieldNotes: [],
    totalLaborHours: 0,
  });

  const selectedJob = jobs.find((j) => j.jobId === selectedJobId);

  // Load jobs list — scoped to this worker's own crew (+ unassigned jobs) when
  // they have one, so a large team's field screen isn't the whole business's
  // open jobs. Scope-as-convenience only (verifyFieldAccess still grants
  // business-wide read) — see src/lib/team/landing.ts's doc comment.
  const loadJobs = useCallback(() => {
    if (!businessId) return;
    setLoadingJobs(true);
    fetch(`/api/jobs?businessId=${businessId}`)
      .then((r) => (r.ok ? r.json() : { jobs: [] }))
      .then((d) => {
        // Every open job, this person's crew's jobs first. Not scoped to the crew any more (2026-10-04): a worker subbed in
        // from another crew — or helping out for a day — must find the job without the office changing assignments first.
        // Finished work (complete, or already invoiced) is not something the crew logs against.
        const myCrew = user?.crewId;
        const open = ((d.jobs ?? []) as Job[])
          .filter((j) => j.status !== "complete" && j.status !== "invoiced")
          .sort((a, b) => Number(!!myCrew && b.assignedCrewId === myCrew) - Number(!!myCrew && a.assignedCrewId === myCrew));
        setJobs(open);
        if (prefillJobId && open.find((j) => j.jobId === prefillJobId)) {
          setSelectedJobId(prefillJobId);
        } else if (!prefillJobId && open.length === 1) {
          // One job on the list: it is the job — skip the "Tap to select" step.
          setSelectedJobId((current) => current || open[0].jobId);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingJobs(false));
  }, [businessId, prefillJobId, user?.crewId]);
  useEffect(() => { loadJobs(); }, [loadJobs]);

  const loadMySchedule = useCallback(async () => {
    if (!businessId || !user?.crewId) {
      setInspectorCrew(null);
      return;
    }
    const crewsResponse = await fetch(`/api/company/crews?businessId=${businessId}`);
    if (!crewsResponse.ok) throw new Error("Schedule roster could not be loaded");
    const crewsData = await crewsResponse.json() as { crews?: Crew[] };
    const row = (crewsData.crews ?? []).find((crew) => crew.crewId === user.crewId && crew.kind === "inspector" && crew.active !== false) ?? null;
    setInspectorCrew(row);
    if (!row) return;
    const from = Date.now();
    const to = from + 8 * 24 * 60 * 60 * 1000;
    const [appointmentsResponse, blocksResponse] = await Promise.all([
      fetch(`/api/businesses/${businessId}/appointments?from=${from}&to=${to}`),
      fetch(`/api/company/time-blocks?businessId=${businessId}&crewId=${row.crewId}&from=${from}&to=${to}`),
    ]);
    if (!appointmentsResponse.ok || !blocksResponse.ok) throw new Error("Schedule could not be loaded");
    const [{ appointments }, { blocks }] = await Promise.all([appointmentsResponse.json(), blocksResponse.json()]) as [
      { appointments?: Array<BookingDetailsValue & { appointmentId: string; assignedCrewId?: string; endTime?: number; status?: string }> },
      { blocks?: TimeBlock[] },
    ];
    setScheduleAppointments((appointments ?? []).filter((appointment) => appointment.assignedCrewId === row.crewId && appointment.status !== "cancelled").sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0)));
    setScheduleBlocks((blocks ?? []).sort((a, b) => a.startTime - b.startTime));
    setScheduleError(null);
  }, [businessId, user?.crewId]);

  useEffect(() => {
    void loadMySchedule().catch(() => setScheduleError("My schedule could not be loaded."));
    const refresh = () => void loadMySchedule().catch(() => setScheduleError("My schedule could not be refreshed."));
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [loadMySchedule]);

  async function addMyBlock() {
    if (!businessId || !inspectorCrew) return;
    const startTime = Date.parse(blockStart);
    const endTime = Date.parse(blockEnd);
    if (!blockLabel.trim() || !Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
      setScheduleError("Choose a label and an end time after the start time.");
      return;
    }
    const response = await fetch("/api/company/time-blocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, crewId: inspectorCrew.crewId, label: blockLabel, startTime, endTime }) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({} as { error?: string }));
      setScheduleError(data.error ?? "Blocked time could not be saved.");
      return;
    }
    setBlockFormOpen(false);
    await loadMySchedule();
  }

  async function removeMyBlock(blockId: string) {
    if (!businessId) return;
    const response = await fetch(`/api/company/time-blocks?businessId=${businessId}&blockId=${encodeURIComponent(blockId)}`, { method: "DELETE" });
    if (!response.ok) { setScheduleError("Blocked time could not be removed."); return; }
    setScheduleBlocks((current) => current.filter((block) => block.blockId !== blockId));
  }

  async function startInspection(appointmentId: string) {
    if (!businessId) return;
    const response = await fetch("/api/jobs/from-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, appointmentId }) });
    const data = await response.json().catch(() => ({} as { job?: Job; error?: string }));
    if (!response.ok || !data.job) { setScheduleError(data.error ?? "The inspection could not be started."); return; }
    setJobs((current) => current.some((job) => job.jobId === data.job!.jobId) ? current : [data.job!, ...current]);
    setSelectedJobId(data.job.jobId);
  }

  // Load structured job data when selection changes
  useEffect(() => {
    if (!selectedJob) {
      setJobLogData({ materials: [], laborEntries: [], timelineEvents: [], fieldNotes: [], totalLaborHours: 0 });
      return;
    }
    setJobLogData({
      materials: selectedJob.materials || [],
      laborEntries: selectedJob.laborEntries || [],
      timelineEvents: selectedJob.timelineEvents || [],
      fieldNotes: selectedJob.fieldNotes || [],
      totalLaborHours: selectedJob.totalLaborHours || 0,
    });
  }, [selectedJobId, jobs]);

  // A saved note updates this screen's job log only if it was for the job still on screen.
  const [notesVersion, setNotesVersion] = useState(0);
  // One line instead of the old four-section "Job Log" card: the totals the crew cares about; details are on the job page.
  const soFar = [
    jobLogData.materials.length ? jobLogData.materials.slice(0, 3).map((m) => `${m.quantity} ${m.unit} ${m.name}`).join(", ") + (jobLogData.materials.length > 3 ? ` +${jobLogData.materials.length - 3} more` : "") : "",
    jobLogData.totalLaborHours > 0 ? `${jobLogData.totalLaborHours.toFixed(1)} h labor` : "",
  ].filter(Boolean).join(" · ");

  const handleSaved = useCallback((receipt: SavedReceipt) => {
    if (receipt.updatedJob && receipt.jobId === selectedJobId) setJobLogData(receipt.updatedJob);
    setNotesVersion((v) => v + 1);
  }, [selectedJobId]);

  // The job this person is clocked in at (from the time clock). Opening the screen already clocked in at a job selects
  // that job, so the first note goes where the hours are.
  const [clockedInJobId, setClockedInJobId] = useState<string | null>(null);
  const handleDay = useCallback((day: WorkerDay) => {
    const open = day.state === "site" || day.state === "site_break" ? day.openJobId ?? null : null;
    setClockedInJobId(open);
    if (open) setSelectedJobId((current) => current || open);
  }, []);

  return (
    <>
      {/* Keyframe animation injected once */}
      <style>{`
        @keyframes fieldPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(1.4); }
        }
      `}</style>

      {/* Dark full-bleed wrapper that overrides company-main padding */}
      <div className="company-field-page" style={{
        margin: "-28px",
        background: "#0f172a",
      }}>
        <div className="company-field-content" style={{
          maxWidth: 480,
          margin: "0 auto",
          padding: "20px 16px 80px",
        }}>

          {/* Header */}
          <header style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}>
            <div>
              {/* Opened from a job ("Submit update"): the only way back used to be the side menu. */}
              {prefillJobId && user?.role !== "crew" && (
                <a href={`/company/jobs/${encodeURIComponent(prefillJobId)}${previewParam ? `?preview=${encodeURIComponent(previewParam)}` : ""}`}
                  style={{ display: "inline-block", marginBottom: 8, fontSize: 13, fontWeight: 600, color: "#7c93c8", textDecoration: "none" }}>
                  ← Back to job {prefillJobId}
                </a>
              )}
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#f8fafc", display: "flex", alignItems: "center", gap: 7 }}>
                <ClipboardList size={19} strokeWidth={1.75} />
                Field Log
              </h1>
              {user && (
                <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                  Signed in as {workerDisplayName}
                </p>
              )}
            </div>
            <button
              onClick={() => { loadJobs(); setNotesVersion((v) => v + 1); }}
              aria-label="Refresh jobs"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "#475569",
                padding: 4,
                lineHeight: 1,
                display: "inline-flex",
                alignItems: "center",
              }}
              title="Refresh"
            >
              <RefreshCw size={18} strokeWidth={1.75} />
            </button>
          </header>

          {inspectorCrew && (
            <section aria-labelledby="my-schedule-title" style={{ marginBottom: 20, padding: 14, border: "1px solid #334155", borderRadius: 16, background: "#1e293b", color: "#f8fafc" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}><h2 id="my-schedule-title" style={{ margin: 0, fontSize: 16 }}>My schedule</h2><p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: 12 }}>Today and the next 7 days</p></div>
                <button className="button small" type="button" onClick={() => {
                  const start = new Date(); start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30, 0, 0); const end = new Date(start.getTime() + 3600000);
                  const local = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
                  setBlockStart(local(start)); setBlockEnd(local(end)); setBlockFormOpen(true);
                }}>＋ Block time</button>
              </div>
              {businessId && <CalendarFeedLink businessId={businessId} />}
              {scheduleError && <p role="alert" style={{ color: "#fca5a5", fontSize: 12 }}>{scheduleError}</p>}
              {blockFormOpen && <div style={{ display: "grid", gap: 8, padding: 10, borderRadius: 10, background: "#0f172a", marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{["Site visit", "Materials pickup", "Office", "Off"].map((label) => <button key={label} className={`button small${blockLabel === label ? " primary" : ""}`} type="button" onClick={() => setBlockLabel(label)}>{label}</button>)}</div>
                <input aria-label="Block label" value={blockLabel} onChange={(event) => setBlockLabel(event.target.value)} />
                <label style={{ fontSize: 12 }}>Start<input aria-label="Block start" type="datetime-local" value={blockStart} onChange={(event) => setBlockStart(event.target.value)} style={{ display: "block", width: "100%" }} /></label>
                <label style={{ fontSize: 12 }}>End<input aria-label="Block end" type="datetime-local" value={blockEnd} onChange={(event) => setBlockEnd(event.target.value)} style={{ display: "block", width: "100%" }} /></label>
                <div style={{ display: "flex", gap: 8 }}><button className="button primary" type="button" onClick={() => void addMyBlock()}>Add block</button><button className="button" type="button" onClick={() => setBlockFormOpen(false)}>Cancel</button></div>
              </div>}
              <div style={{ display: "grid", gap: 8 }}>
                {[...scheduleAppointments.map((appointment) => ({ kind: "appointment" as const, at: appointment.startTime ?? 0, appointment })), ...scheduleBlocks.map((block) => ({ kind: "block" as const, at: block.startTime, block }))].sort((a, b) => a.at - b.at).map((item) => item.kind === "appointment" ? (
                  <article key={item.appointment.appointmentId} style={{ padding: 10, borderRadius: 10, background: "#0f172a" }}>
                    <BookingDetails booking={item.appointment} inspectorName={inspectorCrew.name} timeZone={tz} compact />
                    {(user?.role === "owner" || user?.role === "staff" || user?.superadmin) && <button className="button primary small" type="button" onClick={() => void startInspection(item.appointment.appointmentId)} style={{ marginTop: 8 }}>Start inspection</button>}
                  </article>
                ) : (
                  <article key={item.block.blockId} style={{ padding: 10, borderRadius: 10, background: "repeating-linear-gradient(135deg,#334155,#334155 6px,#475569 6px,#475569 12px)", display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1 }}><strong>{item.block.label}</strong><div style={{ fontSize: 12 }}>{new Date(item.block.startTime).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: tz })}–{new Date(item.block.endTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}</div></div>
                    <button type="button" aria-label={`Remove ${item.block.label} block`} onClick={() => void removeMyBlock(item.block.blockId)} style={{ border: 0, background: "transparent", color: "#fff", cursor: "pointer" }}><X size={18} /></button>
                  </article>
                ))}
                {scheduleAppointments.length === 0 && scheduleBlocks.length === 0 && <p style={{ color: "#94a3b8", fontSize: 13 }}>Nothing scheduled yet.</p>}
              </div>
            </section>
          )}

          {/* Job Selector */}
          {!loadingJobs && jobs.length === 0 && (
            <EmptyState compact tone="dark" title="No open jobs right now" body="The office opens jobs from Pipeline. You can still clock in at the shop below." testId="field-empty" />
          )}
          <div style={{ marginBottom: 20 }}>
            <JobSelector
              jobs={jobs}
              loading={loadingJobs}
              selectedId={selectedJobId}
              onSelect={setSelectedJobId}
              myCrewId={user?.crewId}
            />
          </div>

          <TimeClock businessId={businessId} jobId={selectedJobId || null} workerName={workerDisplayName} onDayChange={handleDay} />

          {selectedJobId && <>
          <div style={{ marginBottom: 20 }}>
            <FieldNoteComposer
              businessId={businessId}
              job={selectedJob ? { jobId: selectedJob.jobId, title: selectedJob.title, address: selectedJob.address } : { jobId: selectedJobId }}
              authorName={workerDisplayName}
              clockedInJobId={clockedInJobId}
              onSaved={handleSaved}
            />
          </div>

          {/* Photo and Finding side by side — two taps that belong together */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <PhotoCapture jobId={selectedJobId || null} businessId={businessId} submittedBy={workerDisplayName || undefined} />
            <FieldFindingsButton jobId={selectedJobId || null} businessId={businessId} />
          </div>

          {soFar && <p style={{ margin: "0 0 12px", fontSize: 12, color: "#94a3b8" }}>So far on {selectedJobId}: {soFar}</p>}
          <div style={{ marginBottom: 20 }}>
            <RecentNotes businessId={businessId} jobId={selectedJobId} refreshKey={notesVersion} />
          </div>
          </>}

        </div>
      </div>
    </>
  );
}

export default function FieldPage() {
  return (
    <Suspense fallback={
      <div style={{ background: "#0f172a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", margin: "-28px" }}>
        <span style={{ color: "#475569", fontSize: 14 }}>Loading…</span>
      </div>
    }>
      <FieldPageContent />
    </Suspense>
  );
}
