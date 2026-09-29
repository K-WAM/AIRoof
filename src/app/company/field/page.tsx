"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessTimezone } from "@/hooks/useBusinessTimezone";
import { useFieldAudio, FieldAudioResult } from "@/hooks/useFieldAudio";
import { PhotoCapture } from "@/components/field/PhotoCapture";
import { FieldFindingsButton } from "@/components/field/FindingPickerSheet";
import { TimeClock } from "@/components/field/TimeClock";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import type { Job, FieldMaterial, FieldLaborEntry, FieldTimelineEvent } from "@/types/jobs";
import type { Crew } from "@/types/library";
import type { TimeBlock } from "@/types/schedule";
import { BookingDetails, type BookingDetailsValue } from "@/components/appointments/BookingDetails";
import { CalendarFeedLink } from "@/components/field/CalendarFeedLink";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock3,
  MapPin,
  Mic,
  Package,
  RefreshCw,
  StickyNote,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

// ─── Job Selector ────────────────────────────────────────────────────────────

function JobSelector({
  jobs,
  loading,
  selectedId,
  onSelect,
}: {
  jobs: Job[];
  loading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = jobs.find((j) => j.jobId === selectedId);

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
                <div style={{ fontSize: 17, fontWeight: 900, color: "#f97316" }}>
                  #{job.jobId}
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

// ─── Mic Button ──────────────────────────────────────────────────────────────

function MicButton({
  status,
  disabled,
  onPressStart,
  onPressEnd,
}: {
  status: "idle" | "recording" | "busy" | "success" | "error";
  disabled: boolean;
  onPressStart: (e: React.PointerEvent) => void;
  onPressEnd: (e: React.PointerEvent) => void;
}) {
  const isRecording = status === "recording";
  const isBusy = status === "busy";

  const btnBg = disabled || isBusy
    ? "#334155"
    : isRecording
    ? "#f97316"
    : "#1e293b";

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* Pulse rings when recording */}
      {isRecording && (
        <>
          <div style={{
            position: "absolute",
            width: 160,
            height: 160,
            borderRadius: "50%",
            background: "rgba(249,115,22,0.15)",
            animation: "fieldPulse 1.5s ease-in-out infinite",
          }} />
          <div style={{
            position: "absolute",
            width: 144,
            height: 144,
            borderRadius: "50%",
            background: "rgba(249,115,22,0.1)",
            animation: "fieldPulse 1.5s ease-in-out 0.2s infinite",
          }} />
        </>
      )}

      <button
        onPointerDown={onPressStart}
        onPointerUp={onPressEnd}
        onPointerLeave={onPressEnd}
        onPointerCancel={onPressEnd}
        disabled={disabled || isBusy}
        style={{
          position: "relative",
          zIndex: 1,
          width: 120,
          height: 120,
          borderRadius: "50%",
          border: "none",
          background: btnBg,
          cursor: disabled || isBusy ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: isRecording
            ? "0 0 40px rgba(249,115,22,0.5)"
            : "0 4px 20px rgba(0,0,0,0.4)",
          transition: "background 0.15s, box-shadow 0.2s, transform 0.1s",
          transform: isRecording ? "scale(0.96)" : "scale(1)",
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        <Mic size={48} strokeWidth={1.75} style={{ color: isRecording ? "#fff" : "#94a3b8" }} />
      </button>
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

function JobLogSection({
  title,
  Icon,
  count,
  children,
}: {
  title: string;
  Icon: LucideIcon;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  if (count === 0) return null;

  return (
    <div style={{ borderTop: "1px solid #334155" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "#94a3b8",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 6 }}>
          <Icon size={13} strokeWidth={1.75} />
          {title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            background: "#f97316",
            color: "#fff",
            fontSize: 10,
            fontWeight: 800,
            borderRadius: 10,
            padding: "1px 6px",
            minWidth: 18,
            textAlign: "center",
          }}>{count}</span>
          {open
            ? <ChevronUp size={13} strokeWidth={1.75} style={{ color: "#475569" }} />
            : <ChevronDown size={13} strokeWidth={1.75} style={{ color: "#475569" }} />}
        </div>
      </button>
      {open && (
        <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function LogRow({ left, right }: { left: string; right: string }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      background: "rgba(51,65,85,0.4)",
      borderRadius: 8,
      padding: "8px 12px",
    }}>
      <span style={{ fontSize: 13, color: "#f1f5f9" }}>{left}</span>
      <span style={{ fontSize: 11, fontFamily: "monospace", color: "#94a3b8" }}>{right}</span>
    </div>
  );
}

function JobLogCard({ data }: { data: JobLogData }) {
  const hasContent =
    data.materials.length > 0 ||
    data.laborEntries.length > 0 ||
    data.timelineEvents.length > 0 ||
    data.fieldNotes.length > 0;

  if (!hasContent) return null;

  return (
    <div style={{
      background: "#1e293b",
      border: "1px solid #334155",
      borderRadius: 16,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc", display: "flex", alignItems: "center", gap: 6 }}>
          <ClipboardList size={16} strokeWidth={1.75} />
          Job Log
        </span>
        {data.totalLaborHours > 0 && (
          <span style={{ fontSize: 12, color: "#f97316", fontWeight: 600 }}>
            {data.totalLaborHours.toFixed(1)}h total
          </span>
        )}
      </div>

      {/* Materials */}
      <JobLogSection title="Materials" Icon={Package} count={data.materials.length}>
        {data.materials.map((m, i) => (
          <LogRow key={i} left={m.name} right={`${m.quantity} ${m.unit}`} />
        ))}
      </JobLogSection>

      {/* Timeline */}
      <JobLogSection title="Timeline" Icon={Clock3} count={data.timelineEvents.length}>
        {data.timelineEvents.map((ev, i) => (
          <LogRow key={i} left={ev.notes || ev.eventType} right={ev.time || ""} />
        ))}
      </JobLogSection>

      {/* Labor */}
      <JobLogSection title="Labor" Icon={Users} count={data.laborEntries.length}>
        {data.laborEntries.map((e, i) => (
          <div
            key={i}
            style={{
              background: "rgba(51,65,85,0.4)",
              borderRadius: 8,
              padding: "8px 12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div>
              <div style={{ fontSize: 13, color: "#f1f5f9", fontWeight: 500 }}>
                {e.workerName}{e.role ? ` · ${e.role}` : ""}
              </div>
              {(e.timeIn || e.timeOut) && (
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                  {e.timeIn && `In: ${e.timeIn}`}
                  {e.timeIn && e.timeOut ? " · " : ""}
                  {e.timeOut && `Out: ${e.timeOut}`}
                </div>
              )}
            </div>
            {e.hours != null && (
              <span style={{ fontSize: 14, color: "#f97316", fontWeight: 700, fontFamily: "monospace" }}>
                {e.hours}h
              </span>
            )}
          </div>
        ))}
      </JobLogSection>

      {/* Notes */}
      <JobLogSection title="Notes" Icon={StickyNote} count={data.fieldNotes.length}>
        {data.fieldNotes.map((n, i) => (
          <div
            key={i}
            style={{
              background: "rgba(51,65,85,0.4)",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              color: "#cbd5e1",
            }}
          >
            {n}
          </div>
        ))}
      </JobLogSection>
    </div>
  );
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
  useEffect(() => {
    if (!businessId) return;
    const crewParams = user?.crewId ? `&crewId=${encodeURIComponent(user.crewId)}&includeUnassigned=1` : "";
    fetch(`/api/jobs?businessId=${businessId}${crewParams}`)
      .then((r) => r.json())
      .then((d) => {
        const open = (d.jobs as Job[]).filter((j) => j.status !== "complete");
        setJobs(open);
        if (prefillJobId && open.find((j) => j.jobId === prefillJobId)) {
          setSelectedJobId(prefillJobId);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingJobs(false));
  }, [businessId, prefillJobId, user?.crewId]);

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

  const handleSuccess = useCallback((result: FieldAudioResult) => {
    setJobLogData(result.updatedJob);
  }, []);

  const { status: audioStatus, progress: audioProgress, transcript, proposedCorrection, confirmCorrection, cancelCorrection, startRecording, stopRecording } = useFieldAudio(
    selectedJobId || null,
    {
      businessId,
      submittedBy: workerDisplayName || undefined,
      jobContext: selectedJob
        ? {
            title: selectedJob.title,
            address: selectedJob.address,
            serviceType: selectedJob.serviceType,
            clientName: selectedJob.clientName,
          }
        : undefined,
      onSuccess: handleSuccess,
    }
  );

  // Map hook status to button display status
  const btnStatus =
    audioStatus === "recording"
      ? "recording"
      : audioStatus === "transcribing"
      ? "busy"
      : audioStatus === "success"
      ? "success"
      : audioStatus === "error"
      ? "error"
      : "idle";

  const statusLabel =
    !selectedJobId ? "Select a job first" :
    btnStatus === "recording" ? "Listening…" :
    btnStatus === "busy" ? (audioProgress ?? "Transcribing…") :
    btnStatus === "success" ? "✓ Logged" :
    btnStatus === "error" ? "Failed — try again" :
    "HOLD TO SPEAK";

  const statusColor =
    btnStatus === "recording" ? "#f97316" :
    btnStatus === "busy" ? "#94a3b8" :
    btnStatus === "success" ? "#22c55e" :
    btnStatus === "error" ? "#ef4444" :
    "#475569";

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
                <p style={{ margin: 0, fontSize: 11, color: "#475569", marginTop: 2 }}>
                  {workerDisplayName}
                </p>
              )}
            </div>
            <button
              onClick={() => {
                if (!businessId) return;
                setLoadingJobs(true);
                const crewParams = user?.crewId ? `&crewId=${encodeURIComponent(user.crewId)}&includeUnassigned=1` : "";
                fetch(`/api/jobs?businessId=${businessId}${crewParams}`)
                  .then((r) => r.json())
                  .then((d) => {
                    const open = (d.jobs as Job[]).filter((j) => j.status !== "complete");
                    setJobs(open);
                    const refreshed = open.find((j) => j.jobId === selectedJobId);
                    if (refreshed) {
                      setJobLogData({
                        materials: refreshed.materials || [],
                        laborEntries: refreshed.laborEntries || [],
                        timelineEvents: refreshed.timelineEvents || [],
                        fieldNotes: refreshed.fieldNotes || [],
                        totalLaborHours: refreshed.totalLaborHours || 0,
                      });
                    }
                  })
                  .catch(console.error)
                  .finally(() => setLoadingJobs(false));
              }}
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
            <EmptyState compact tone="dark" title="No job assigned to you today" body="Ask the office to assign one. You can still use the time clock below." testId="field-empty" />
          )}
          <div style={{ marginBottom: 20 }}>
            <JobSelector
              jobs={jobs}
              loading={loadingJobs}
              selectedId={selectedJobId}
              onSelect={setSelectedJobId}
            />
          </div>

          <TimeClock businessId={businessId} jobId={selectedJobId || null} workerName={workerDisplayName} />

          {selectedJobId && <>
          {/* Mic Button */}
          <div style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
            marginBottom: 40,
          }}>
            <MicButton
              status={btnStatus}
              disabled={!selectedJobId}
              onPressStart={startRecording}
              onPressEnd={stopRecording}
            />

            <p style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: statusColor,
              transition: "color 0.2s",
            }}>
              {statusLabel}
            </p>

            {/* Transcript preview */}
            {transcript && btnStatus !== "recording" && (
              <p style={{
                margin: 0,
                fontSize: 12,
                color: "#475569",
                fontStyle: "italic",
                textAlign: "center",
                maxWidth: 320,
                lineHeight: 1.5,
              }}>
                &ldquo;{transcript}&rdquo;
              </p>
            )}
          </div>

          {/* Photo capture */}
          <div style={{ marginBottom: 20 }}>
            <PhotoCapture jobId={selectedJobId || null} businessId={businessId} submittedBy={workerDisplayName || undefined} />
          </div>

          {/* Findings — pick from the Library (names only; the server copies it onto this job) */}
          <div style={{ marginBottom: 20 }}>
            <FieldFindingsButton jobId={selectedJobId || null} businessId={businessId} />
          </div>
          </>}

          {/* One-tap correction confirm card */}
          {proposedCorrection && (
            <div style={{ marginBottom: 20, padding: "16px", background: "#1e293b", border: "1.5px solid #f97316", borderRadius: 16 }}>
              <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 800, color: "#fdba74", textTransform: "uppercase", letterSpacing: "0.06em" }}>Confirm correction</p>
              <p style={{ margin: "0 0 4px", fontSize: 15, color: "#f8fafc", lineHeight: 1.5 }}>
                Change <strong style={{ textTransform: "capitalize" }}>{proposedCorrection.item}</strong> from{" "}
                <strong style={{ color: "#fca5a5" }}>{proposedCorrection.oldValue}</strong> → <strong style={{ color: "#86efac" }}>{proposedCorrection.newValue}</strong>?
              </p>
              <p style={{ margin: "0 0 14px", fontSize: 13, color: "#94a3b8" }}>
                Running total becomes <strong style={{ color: "#f8fafc" }}>{proposedCorrection.newTotal}</strong> (was {proposedCorrection.currentTotal}).
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={cancelCorrection} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1.5px solid #334155", background: "transparent", color: "#94a3b8", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <X size={15} strokeWidth={1.75} />
                  Cancel
                </button>
                <button onClick={confirmCorrection} style={{ flex: 2, padding: "12px", borderRadius: 12, border: "none", background: "#f97316", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Check size={15} strokeWidth={1.75} />
                  Confirm change
                </button>
              </div>
            </div>
          )}

          {/* Job Log Card */}
          <JobLogCard data={jobLogData} />

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
