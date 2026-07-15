"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useFieldAudio, FieldAudioResult } from "@/hooks/useFieldAudio";
import { PhotoCapture } from "@/components/field/PhotoCapture";
import { useAuth } from "@/contexts/AuthContext";
import type { Job, FieldMaterial, FieldLaborEntry, FieldTimelineEvent } from "@/types/jobs";

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
              <span style={{ marginLeft: "auto", color: "#64748b", fontSize: 18 }}>
                {open ? "▲" : "▼"}
              </span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#f8fafc", marginTop: 4 }}>{selected.title}</div>
            {selected.address && (
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>📍 {selected.address}</div>
            )}
          </>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#64748b", fontSize: 15 }}>
              {jobs.length === 0 ? "— No open jobs —" : "Tap to select a job…"}
            </span>
            <span style={{ color: "#64748b", fontSize: 18 }}>{open ? "▲" : "▼"}</span>
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
        <svg
          width={48}
          height={48}
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{ color: isRecording ? "#fff" : "#94a3b8" }}
        >
          <path d="M12 1a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4zm6 10a6 6 0 0 1-12 0H4a8 8 0 0 0 7 7.93V21H9v2h6v-2h-2v-2.07A8 8 0 0 0 20 11h-2z" />
        </svg>
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
  count,
  children,
}: {
  title: string;
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
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
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
          <span style={{ fontSize: 12, color: "#475569" }}>{open ? "▲" : "▼"}</span>
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
        <span style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc" }}>Job Log</span>
        {data.totalLaborHours > 0 && (
          <span style={{ fontSize: 12, color: "#f97316", fontWeight: 600 }}>
            {data.totalLaborHours.toFixed(1)}h total
          </span>
        )}
      </div>

      {/* Materials */}
      <JobLogSection title="📦 Materials" count={data.materials.length}>
        {data.materials.map((m, i) => (
          <LogRow key={i} left={m.name} right={`${m.quantity} ${m.unit}`} />
        ))}
      </JobLogSection>

      {/* Timeline */}
      <JobLogSection title="🕐 Timeline" count={data.timelineEvents.length}>
        {data.timelineEvents.map((ev, i) => (
          <LogRow key={i} left={ev.notes || ev.eventType} right={ev.time || ""} />
        ))}
      </JobLogSection>

      {/* Labor */}
      <JobLogSection title="👷 Labor" count={data.laborEntries.length}>
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
      <JobLogSection title="📝 Notes" count={data.fieldNotes.length}>
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
  const { user } = useAuth();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState(prefillJobId);
  const [jobLogData, setJobLogData] = useState<JobLogData>({
    materials: [],
    laborEntries: [],
    timelineEvents: [],
    fieldNotes: [],
    totalLaborHours: 0,
  });

  const selectedJob = jobs.find((j) => j.jobId === selectedJobId);

  // Load jobs list
  useEffect(() => {
    if (!businessId) return;
    fetch(`/api/jobs?businessId=${businessId}`)
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
  }, [businessId, prefillJobId]);

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

  const { status: audioStatus, transcript, proposedCorrection, confirmCorrection, cancelCorrection, startRecording, stopRecording } = useFieldAudio(
    selectedJobId || null,
    {
      businessId,
      submittedBy: user?.email || undefined,
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
    btnStatus === "busy" ? "Transcribing…" :
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
      <div style={{
        margin: "-28px",
        background: "#0f172a",
        minHeight: "calc(100vh - 64px)",
      }}>
        <div style={{
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
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#f8fafc" }}>
                Field Log
              </h1>
              {user && (
                <p style={{ margin: 0, fontSize: 11, color: "#475569", marginTop: 2 }}>
                  {user.email}
                </p>
              )}
            </div>
            <button
              onClick={() => {
                if (!businessId) return;
                setLoadingJobs(true);
                fetch(`/api/jobs?businessId=${businessId}`)
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
                fontSize: 18,
                padding: 4,
                lineHeight: 1,
              }}
              title="Refresh"
            >
              ↻
            </button>
          </header>

          {/* Job Selector */}
          <div style={{ marginBottom: 32 }}>
            <JobSelector
              jobs={jobs}
              loading={loadingJobs}
              selectedId={selectedJobId}
              onSelect={setSelectedJobId}
            />
          </div>

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
            <PhotoCapture jobId={selectedJobId || null} businessId={businessId} submittedBy={user?.email || undefined} />
          </div>

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
                <button onClick={cancelCorrection} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1.5px solid #334155", background: "transparent", color: "#94a3b8", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Cancel</button>
                <button onClick={confirmCorrection} style={{ flex: 2, padding: "12px", borderRadius: 12, border: "none", background: "#f97316", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Confirm change</button>
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
