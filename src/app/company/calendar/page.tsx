"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessTimezone } from "@/hooks/useBusinessTimezone";
import { useSearchParams } from "next/navigation";
import type { Job } from "@/types/jobs";
import type { Crew } from "@/types/library";

interface Appointment {
  appointmentId: string;
  callerName?: string;
  serviceType?: string;
  startTime: number;
  status: string;
  pendingConfirmation?: boolean;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay(); // 0=Sun
  const diff = (day + 6) % 7; // days since Monday
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(aMs: number, b: Date): boolean {
  const a = new Date(aMs);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function dayAt8am(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, 0, 0, 0).getTime();
}

export default function CalendarPage() {
  const businessId = useBusinessId();
  const tz = useBusinessTimezone();
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");
  const previewSuffix = preview ? `?preview=${preview}` : "";

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [fullWeek, setFullWeek] = useState(false);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const days = useMemo(() => Array.from({ length: fullWeek ? 7 : 5 }, (_, i) => addDays(weekStart, i)), [weekStart, fullWeek]);

  useEffect(() => {
    if (!businessId) return;
    Promise.all([
      fetch(`/api/company/crews?businessId=${businessId}`).then((r) => r.json()).catch(() => ({ crews: [] })),
      fetch(`/api/jobs?businessId=${businessId}`).then((r) => r.json()).catch(() => ({ jobs: [] })),
    ])
      .then(([cr, jr]) => {
        setCrews((cr.crews ?? []).filter((c: Crew) => c.active));
        setJobs((jr.jobs ?? []).filter((j: Job) => j.status !== "complete"));
      })
      .finally(() => setLoading(false));
  }, [businessId]);

  // Appointments via API (kept light) — load active appointments for the visible window.
  useEffect(() => {
    if (!businessId) return;
    const startMs = weekStart.getTime();
    const endMs = addDays(weekStart, 7).getTime();
    fetch(`/api/jobs?businessId=${businessId}`).catch(() => {}); // warm
    import("firebase/firestore").then(async ({ collection, getDocs, query, where, orderBy }) => {
      const { db } = await import("@/lib/firebase/client");
      if (!db) return;
      try {
        const snap = await getDocs(query(
          collection(db, "businesses", businessId, "appointments"),
          where("startTime", ">=", startMs),
          where("startTime", "<=", endMs),
          orderBy("startTime", "asc"),
        ));
        setAppts(snap.docs.map((d) => ({ appointmentId: d.id, ...d.data() } as Appointment)));
      } catch {
        setAppts([]);
      }
    });
  }, [businessId, weekStart]);

  const unscheduled = jobs.filter((j) => !j.scheduledStart || !j.assignedCrewId);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function placeJob(jobId: string, crewId: string, dayMs: number) {
    setJobs((prev) => prev.map((j) => (j.jobId === jobId ? { ...j, assignedCrewId: crewId, scheduledStart: dayMs, crewConfirmed: false } : j)));
    await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, assignedCrewId: crewId, scheduledStart: dayMs, crewConfirmed: false }),
    }).catch(() => {});
  }

  async function unschedule(jobId: string) {
    setJobs((prev) => prev.map((j) => (j.jobId === jobId ? { ...j, assignedCrewId: undefined, scheduledStart: undefined, crewConfirmed: false } : j)));
    await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, assignedCrewId: null, scheduledStart: null, crewConfirmed: false }),
    }).catch(() => {});
  }

  async function confirmJob(job: Job) {
    if (!job.assignedCrewId || !job.scheduledStart) return;
    setBusyJob(job.jobId);
    try {
      const res = await fetch(`/api/jobs/${job.jobId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, crewId: job.assignedCrewId, scheduledStart: job.scheduledStart }),
      });
      const data = await res.json();
      if (res.ok) {
        setJobs((prev) => prev.map((j) => (j.jobId === job.jobId ? { ...j, crewConfirmed: true } : j)));
        flash(data.emailed ? "Crew confirmed & emailed ✓" : "Crew confirmed (no email on file)");
      }
    } finally {
      setBusyJob(null);
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const jobId = e.active.id as string;
    const over = e.over?.id as string | undefined;
    if (!over) return;
    const [crewId, dayStr] = over.split("|");
    placeJob(jobId, crewId, Number(dayStr));
  }

  function crewOf(id?: string): Crew | undefined {
    return crews.find((c) => c.crewId === id);
  }

  if (loading) return <div style={{ padding: 32, color: "#666" }}>Loading Powerboard…</div>;

  const rangeLabel = `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTHS[days[days.length - 1].getMonth()]} ${days[days.length - 1].getDate()}`;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Powerboard</h1>
          <p className="page-subtitle">Drag jobs onto a crew &amp; day. Confirm to email the crew and lock it in.</p>
        </div>
        {toast && <span className="status-pill" style={{ background: "#f0fdf4", color: "#15803d", borderColor: "#86efac" }}>{toast}</span>}
      </header>

      {/* Week nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="button" onClick={() => setWeekStart(startOfWeek(new Date()))} style={{ fontSize: 13 }}>Today</button>
          <button className="button" onClick={() => setWeekStart(addDays(weekStart, -7))} style={{ fontSize: 13, padding: "6px 12px" }}>‹</button>
          <button className="button" onClick={() => setWeekStart(addDays(weekStart, 7))} style={{ fontSize: 13, padding: "6px 12px" }}>›</button>
          <strong style={{ fontSize: 15, color: "#0f172a", marginLeft: 6 }}>{rangeLabel}</strong>
        </div>
        <button className="button" onClick={() => setFullWeek((f) => !f)} style={{ fontSize: 13 }}>{fullWeek ? "Work week" : "Full week"}</button>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, alignItems: "start" }}>
          {/* Unscheduled rail */}
          <section className="panel">
            <div className="panel-header"><h2 className="panel-title" style={{ fontSize: 14 }}>Unscheduled ({unscheduled.length})</h2></div>
            <div className="panel-body" style={{ display: "grid", gap: 8, maxHeight: 560, overflowY: "auto" }}>
              {unscheduled.length === 0 ? (
                <p style={{ fontSize: 13, color: "#94a3b8" }}>All jobs scheduled 🎉</p>
              ) : (
                unscheduled.map((job) => <JobTile key={job.jobId} job={job} crew={undefined} />)
              )}
            </div>
          </section>

          {/* Crew × day grid */}
          <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
            <div style={{ display: "grid", gridTemplateColumns: `140px repeat(${days.length}, minmax(150px, 1fr))`, minWidth: 700 }}>
              {/* Header row */}
              <div style={{ padding: "12px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 12, fontWeight: 700, color: "#64748b" }}>Crew</div>
              {days.map((d) => {
                const isToday = sameDay(Date.now(), d);
                return (
                  <div key={d.toISOString()} style={{ padding: "12px 8px", borderBottom: "1px solid #e2e8f0", borderLeft: "1px solid #f1f5f9", background: isToday ? "#eff6ff" : "#f8fafc", textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{DOW[d.getDay()]}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: isToday ? "#2563eb" : "#0f172a" }}>{d.getDate()}</div>
                  </div>
                );
              })}

              {/* Bookings row (appointments, read-only) */}
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#0369a1" }}>📅 Bookings</div>
              {days.map((d) => {
                const dayAppts = appts.filter((a) => sameDay(a.startTime, d));
                return (
                  <div key={d.toISOString()} style={{ padding: "8px 6px", borderBottom: "1px solid #f1f5f9", borderLeft: "1px solid #f1f5f9", minHeight: 56, display: "grid", gap: 4 }}>
                    {dayAppts.map((a) => {
                      const pending = a.pendingConfirmation || a.status === "requested";
                      return (
                        <Link key={a.appointmentId} href={`/company/appointments${previewSuffix}`} style={{ textDecoration: "none" }}>
                          <div style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6, background: pending ? "#f1f5f9" : "#dbeafe", color: pending ? "#64748b" : "#1d4ed8", border: pending ? "1px dashed #cbd5e1" : "none", lineHeight: 1.3 }}>
                            {new Date(a.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })} {a.callerName ?? "Appt"}
                            {pending && <span style={{ display: "block", fontSize: 9, fontWeight: 700 }}>UNCONFIRMED</span>}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                );
              })}

              {/* Crew rows */}
              {crews.length === 0 ? (
                <div style={{ gridColumn: `1 / -1`, padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
                  No crews yet. <Link href={`/company/library${previewSuffix}`} style={{ color: "#2563eb" }}>Add crews in the Library →</Link>
                </div>
              ) : (
                crews.map((crew) => (
                  <CrewRow
                    key={crew.crewId}
                    crew={crew}
                    days={days}
                    jobs={jobs.filter((j) => j.assignedCrewId === crew.crewId && j.scheduledStart)}
                    onConfirm={confirmJob}
                    onUnschedule={unschedule}
                    busyJob={busyJob}
                    previewSuffix={previewSuffix}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </DndContext>
    </>
  );
}

// ── Crew row with droppable day cells ─────────────────────────────────────────
function CrewRow({
  crew, days, jobs, onConfirm, onUnschedule, busyJob, previewSuffix,
}: {
  crew: Crew;
  days: Date[];
  jobs: Job[];
  onConfirm: (j: Job) => void;
  onUnschedule: (jobId: string) => void;
  busyJob: string | null;
  previewSuffix: string;
}) {
  return (
    <>
      <div style={{ padding: "12px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: crew.color, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{crew.name}</span>
      </div>
      {days.map((d) => (
        <DayCell key={d.toISOString()} crewId={crew.crewId} day={d}>
          {jobs.filter((j) => j.scheduledStart && sameDay(j.scheduledStart, d)).map((job) => (
            <ScheduledTile key={job.jobId} job={job} crew={crew} onConfirm={onConfirm} onUnschedule={onUnschedule} busy={busyJob === job.jobId} previewSuffix={previewSuffix} />
          ))}
        </DayCell>
      ))}
    </>
  );
}

function DayCell({ crewId, day, children }: { crewId: string; day: Date; children: React.ReactNode }) {
  const id = `${crewId}|${dayAt8am(day)}`;
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} style={{ padding: 6, borderBottom: "1px solid #f1f5f9", borderLeft: "1px solid #f1f5f9", minHeight: 64, background: isOver ? "#eff6ff" : "transparent", transition: "background 0.12s", display: "grid", gap: 4, alignContent: "start" }}>
      {children}
    </div>
  );
}

// ── Draggable job tile (unscheduled rail) ─────────────────────────────────────
function JobTile({ job }: { job: Job; crew?: Crew }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: job.jobId });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        padding: "8px 10px", borderRadius: 8, background: "#fff", border: "1px solid #e2e8f0",
        cursor: "grab", boxShadow: isDragging ? "0 8px 20px rgba(0,0,0,0.15)" : "0 1px 2px rgba(0,0,0,0.04)",
        opacity: isDragging ? 0.5 : 1, transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        touchAction: "none",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: "#1e293b" }}>{job.jobId}</div>
      <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.3 }}>{job.title}</div>
      {job.address && <div style={{ fontSize: 11, color: "#94a3b8" }}>{job.address}</div>}
    </div>
  );
}

// ── Scheduled tile (in a crew×day cell) — grey until confirmed, then crew color ──
function ScheduledTile({
  job, crew, onConfirm, onUnschedule, busy, previewSuffix,
}: {
  job: Job;
  crew: Crew;
  onConfirm: (j: Job) => void;
  onUnschedule: (jobId: string) => void;
  busy: boolean;
  previewSuffix: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: job.jobId });
  const confirmed = !!job.crewConfirmed;
  return (
    <div
      ref={setNodeRef}
      style={{
        borderRadius: 8, overflow: "hidden",
        border: confirmed ? `1px solid ${crew.color}` : "1px dashed #94a3b8",
        background: confirmed ? `${crew.color}14` : "#f8fafc",
        opacity: isDragging ? 0.5 : 1, transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
      }}
    >
      <div {...listeners} {...attributes} style={{ padding: "6px 8px", cursor: "grab", touchAction: "none", borderLeft: `3px solid ${confirmed ? crew.color : "#cbd5e1"}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: confirmed ? crew.color : "#64748b" }}>{job.jobId}</div>
        <div style={{ fontSize: 11, color: "#334155", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{job.title}</div>
      </div>
      <div style={{ display: "flex", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
        {!confirmed ? (
          <button onClick={() => onConfirm(job)} disabled={busy} style={{ flex: 1, fontSize: 10, fontWeight: 700, padding: "4px", border: "none", background: "transparent", color: "#16a34a", cursor: "pointer" }}>{busy ? "…" : "✓ Confirm"}</button>
        ) : (
          <Link href={`/company/jobs/${job.jobId}${previewSuffix}`} style={{ flex: 1, fontSize: 10, fontWeight: 700, padding: "4px", textAlign: "center", color: crew.color, textDecoration: "none" }}>Open →</Link>
        )}
        <button onClick={() => onUnschedule(job.jobId)} title="Unschedule" style={{ fontSize: 11, padding: "4px 8px", border: "none", borderLeft: "1px solid rgba(0,0,0,0.06)", background: "transparent", color: "#94a3b8", cursor: "pointer" }}>×</button>
      </div>
    </div>
  );
}
