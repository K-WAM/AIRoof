"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessTimezone } from "@/hooks/useBusinessTimezone";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import { useSearchParams } from "next/navigation";
import type { Job } from "@/types/jobs";
import type { Crew } from "@/types/library";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PageError } from "@/components/ui/PageError";
import { runOptimisticCalendarMutation } from "./optimisticMutation";

interface Appointment {
  appointmentId: string;
  callerName?: string;
  callerEmail?: string;
  serviceType?: string;
  startTime: number;
  status: string;
  pendingConfirmation?: boolean;
  assignedCrewId?: string;
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
function dateParts(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function wallTimeToUtc(
  day: Date,
  hour: number,
  minute: number,
  timeZone: string
): number | null {
  const target = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
  let guess = target;
  for (let iteration = 0; iteration < 4; iteration++) {
    const actual = dateParts(guess, timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute
    );
    const adjustment = target - actualAsUtc;
    guess += adjustment;
    if (adjustment === 0) break;
  }
  const result = dateParts(guess, timeZone);
  return result.year === day.getFullYear() &&
    result.month === day.getMonth() + 1 &&
    result.day === day.getDate() &&
    result.hour === hour &&
    result.minute === minute
    ? guess
    : null;
}

function sameDay(aMs: number, b: Date, timeZone: string): boolean {
  const a = dateParts(aMs, timeZone);
  return a.year === b.getFullYear() && a.month === b.getMonth() + 1 && a.day === b.getDate();
}

function dayAtBusinessOpen(
  day: Date,
  businessHours: Record<string, string>,
  timeZone: string
): number | null {
  const weekday = day.toLocaleDateString("en-US", { weekday: "long" });
  const hours = businessHours[weekday];
  const match = hours?.match(/^(\d{1,2}):(\d{2})\s*[-–]/);
  if (!match || hours.trim().toLowerCase() === "closed") return null;
  return wallTimeToUtc(day, Number(match[1]), Number(match[2]), timeZone);
}
/**
 * Move a booking to another day without losing its time of day — a 10:30 cleaning
 * dragged to Thursday is still at 10:30. (Jobs have no time, so they land at 8am.)
 */
function sameTimeOnDay(existingMs: number, day: Date, timeZone: string): number | null {
  const time = dateParts(existingMs, timeZone);
  return wallTimeToUtc(day, time.hour, time.minute, timeZone);
}

export default function CalendarPage() {
  const businessId = useBusinessId();
  const tz = useBusinessTimezone();
  const { calendarMode, vocab, ready: modulesReady } = useBusinessModules();
  // Field service drags jobs onto crews; intake drags bookings onto providers/vendors.
  const apptMode = calendarMode === "appointments";
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");
  const previewSuffix = preview ? `?preview=${preview}` : "";

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  // Default to the full 7-day week so weekends are always visible/schedulable (emergencies).
  const [fullWeek, setFullWeek] = useState(true);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [businessHours, setBusinessHours] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [confirmedAppts, setConfirmedAppts] = useState<Set<string>>(new Set());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const days = useMemo(() => Array.from({ length: fullWeek ? 7 : 5 }, (_, i) => addDays(weekStart, i)), [weekStart, fullWeek]);

  useEffect(() => {
    // Wait for the industry so intake tenants never fire a jobs request.
    if (!businessId || !modulesReady) return;
    Promise.all([
      fetch(`/api/company/crews?businessId=${businessId}`).then((r) => {
        if (!r.ok) throw new Error("Resources request failed");
        return r.json();
      }),
      apptMode
        ? Promise.resolve({ jobs: [] })
        : fetch(`/api/jobs?businessId=${businessId}`).then((r) => {
            if (!r.ok) throw new Error("Jobs request failed");
            return r.json();
          }),
      fetch(`/api/company/settings?businessId=${businessId}`)
        .then((response) => {
          if (!response.ok) throw new Error("Settings request failed");
          return response.json();
        }),
    ])
      .then(([cr, jr, settings]) => {
        setCrews((cr.crews ?? []).filter((c: Crew) => c.active));
        setJobs((jr.jobs ?? []).filter((j: Job) => j.status !== "complete"));
        setBusinessHours(settings.businessHours ?? {});
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [businessId, modulesReady, apptMode]);

  // Appointments for the visible window. In jobs mode they're a read-only
  // "Bookings" strip; in appointments mode they're the draggable cards.
  useEffect(() => {
    if (!businessId) return;
    const startMs = weekStart.getTime();
    const endMs = addDays(weekStart, 7).getTime();
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
        setAppts(
          snap.docs
            .map((d) => ({ appointmentId: d.id, ...d.data() } as Appointment))
            .filter((a) => a.status !== "cancelled")
        );
      } catch {
        setAppts([]);
        setCalendarError("Appointments could not be loaded. Refresh the calendar and try again.");
      }
    });
  }, [businessId, weekStart]);

  // The rail holds whatever still needs a resource: jobs with no crew/day,
  // or bookings the agent took that nobody has been assigned to yet.
  const unscheduled = jobs.filter((j) => !j.scheduledStart || !j.assignedCrewId);
  const unassignedAppts = appts.filter((a) => !a.assignedCrewId);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function placeJob(jobId: string, crewId: string, day: Date) {
    const previous = jobs.find((job) => job.jobId === jobId);
    if (!previous) return;
    const dayMs = dayAtBusinessOpen(day, businessHours, tz);
    if (dayMs === null) {
      setCalendarError("That day is closed or has no valid opening time. Choose an open business day.");
      return;
    }
    const duration = previous.scheduledStart && previous.scheduledEnd
      ? previous.scheduledEnd - previous.scheduledStart
      : 60 * 60 * 1000;
    const scheduledEnd = dayMs + Math.max(duration, 1);
    setCalendarError(null);
    const result = await runOptimisticCalendarMutation({
      apply: () => setJobs((current) => current.map((job) =>
        job.jobId === jobId
          ? { ...job, assignedCrewId: crewId, scheduledStart: dayMs, scheduledEnd, crewConfirmed: false }
          : job
      )),
      persist: () => fetch(`/api/jobs/${jobId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          crewId,
          scheduledStart: dayMs,
          scheduledEnd,
          crewConfirmed: false,
          notify: false,
        }),
      }),
      rollback: () => setJobs((current) => current.map((job) =>
        job.jobId === jobId ? previous : job
      )),
      fallbackError: "The assignment could not be saved. The calendar was restored; try again.",
    });
    if (!result.ok) setCalendarError(result.error ?? "The assignment could not be saved.");
  }

  async function unschedule(jobId: string) {
    const previous = jobs.find((job) => job.jobId === jobId);
    if (!previous) return;
    setCalendarError(null);
    const result = await runOptimisticCalendarMutation({
      apply: () => setJobs((current) => current.map((job) =>
        job.jobId === jobId
          ? { ...job, assignedCrewId: undefined, scheduledStart: undefined, scheduledEnd: undefined, crewConfirmed: false }
          : job
      )),
      persist: () => fetch(`/api/jobs/${jobId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, crewId: null, notify: false }),
      }),
      rollback: () => setJobs((current) => current.map((job) =>
        job.jobId === jobId ? previous : job
      )),
      fallbackError: "The job could not be unscheduled. The calendar was restored; try again.",
    });
    if (!result.ok) setCalendarError(result.error ?? "The job could not be unscheduled.");
  }

  async function confirmJob(job: Job) {
    if (!job.assignedCrewId || !job.scheduledStart) return;
    setBusyJob(job.jobId);
    setCalendarError(null);
    try {
      const res = await fetch(`/api/jobs/${job.jobId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, crewId: job.assignedCrewId, scheduledStart: job.scheduledStart }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setJobs((prev) => prev.map((j) => (j.jobId === job.jobId ? { ...j, crewConfirmed: true } : j)));
        if (data.notificationStatus === "failed") {
          setCalendarError("The assignment is saved, but the crew email failed. Try Confirm again to retry delivery.");
        } else {
          flash(data.emailed ? "Crew confirmed & emailed ✓" : "Crew confirmed (no email on file)");
        }
      } else {
        setCalendarError(data.error ?? "The crew could not be confirmed. Try again.");
      }
    } catch {
      setCalendarError("The crew could not be confirmed. Check your connection and try again.");
    } finally {
      setBusyJob(null);
    }
  }

  async function placeAppt(appointmentId: string, crewId: string, day: Date) {
    const appt = appts.find((a) => a.appointmentId === appointmentId);
    if (!appt) return;
    const startTime = sameTimeOnDay(appt.startTime, day, tz);
    if (startTime === null) {
      setCalendarError("That local time does not exist because of a daylight-saving change. Choose another day.");
      return;
    }
    const wasJustConfirmed = confirmedAppts.has(appointmentId);
    setCalendarError(null);
    const result = await runOptimisticCalendarMutation({
      apply: () => {
        setAppts((current) => current.map((item) =>
          item.appointmentId === appointmentId
            ? {
                ...item,
                assignedCrewId: crewId,
                startTime,
                ...(startTime !== appt.startTime
                  ? { status: "requested", pendingConfirmation: true }
                  : {}),
              }
            : item
        ));
        if (startTime !== appt.startTime) {
          setConfirmedAppts((current) => {
            const next = new Set(current);
            next.delete(appointmentId);
            return next;
          });
        }
      },
      persist: () => fetch(`/api/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, assignedCrewId: crewId, startTime }),
      }),
      rollback: () => {
        setAppts((current) => current.map((item) =>
          item.appointmentId === appointmentId ? appt : item
        ));
        if (wasJustConfirmed) {
          setConfirmedAppts((current) => new Set(current).add(appointmentId));
        }
      },
      fallbackError: "The appointment could not be moved. The calendar was restored; try again.",
    });
    if (!result.ok) setCalendarError(result.error ?? "The appointment could not be moved.");
  }

  async function unassignAppt(appointmentId: string) {
    const previous = appts.find((appointment) => appointment.appointmentId === appointmentId);
    if (!previous) return;
    setCalendarError(null);
    const result = await runOptimisticCalendarMutation({
      apply: () => setAppts((current) => current.map((appointment) =>
        appointment.appointmentId === appointmentId
          ? { ...appointment, assignedCrewId: undefined }
          : appointment
      )),
      persist: () => fetch(`/api/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, assignedCrewId: null }),
      }),
      rollback: () => setAppts((current) => current.map((appointment) =>
        appointment.appointmentId === appointmentId ? previous : appointment
      )),
      fallbackError: "The appointment could not be unassigned. The calendar was restored; try again.",
    });
    if (!result.ok) setCalendarError(result.error ?? "The appointment could not be unassigned.");
  }

  async function confirmAppt(appt: Appointment) {
    setBusyJob(appt.appointmentId);
    setCalendarError(null);
    try {
      const res = await fetch(`/api/appointments/${appt.appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, confirm: true, notifyCustomer: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAppts((prev) =>
          prev.map((a) =>
            a.appointmentId === appt.appointmentId
              ? { ...a, status: "confirmed", pendingConfirmation: false }
              : a
          )
        );
        setConfirmedAppts((prev) => new Set(prev).add(appt.appointmentId));
        if (data.notificationStatus === "failed") {
          setCalendarError(`The appointment is confirmed, but the ${vocab.customerNoun.toLowerCase()} email failed. Confirm again to retry delivery.`);
        } else {
          flash(
            data.notifiedCustomer
              ? `Confirmed & ${vocab.customerNoun.toLowerCase()} emailed ✓`
              : "Confirmed (no email on file)"
          );
        }
      } else {
        setCalendarError(data.error ?? "The appointment could not be confirmed. Try again.");
      }
    } catch {
      setCalendarError("The appointment could not be confirmed. Check your connection and try again.");
    } finally {
      setBusyJob(null);
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const id = e.active.id as string;
    const over = e.over?.id as string | undefined;
    if (!over) return;
    const [crewId, dayStr] = over.split("|");
    const day = new Date(Number(dayStr));
    if (apptMode) placeAppt(id, crewId, day);
    else placeJob(id, crewId, day);
  }

  if (loading) return <PageSkeleton rows={5} />;
  if (loadError) {
    return (
      <PageError
        message="Calendar resources could not be loaded. No schedule is being shown."
        onRetry={() => window.location.reload()}
      />
    );
  }

  const rangeLabel = `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTHS[days[days.length - 1].getMonth()]} ${days[days.length - 1].getDate()}`;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-subtitle">
            {apptMode
              ? `Your scheduling board — drag a booking onto a ${vocab.resourceNoun.toLowerCase()} & day, then Confirm to email the ${vocab.customerNoun.toLowerCase()}.`
              : `Your scheduling board — drag a ${vocab.jobNoun.toLowerCase()} onto a ${vocab.resourceNoun.toLowerCase()} & day, then Confirm to email the ${vocab.resourceNoun.toLowerCase()} and lock it in.`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {toast && <span role="status" className="status-pill" style={{ background: "#f0fdf4", color: "#15803d", borderColor: "#86efac" }}>{toast}</span>}
          <Link href={`/company/library${previewSuffix ? previewSuffix + "&section=crews" : "?section=crews"}`} className="button small">+ Manage {vocab.resourceNounPlural.toLowerCase()}</Link>
        </div>
      </header>

      {calendarError && (
        <div role="alert" style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, border: "1px solid #fca5a5", background: "#fef2f2", color: "#b91c1c", fontSize: 13, fontWeight: 600 }}>
          {calendarError}
        </div>
      )}

      {/* Week nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="button small" onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</button>
          <button className="button small" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))} style={{ display: "flex", alignItems: "center", padding: "6px 10px" }}><ChevronLeft size={16} /></button>
          <button className="button small" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))} style={{ display: "flex", alignItems: "center", padding: "6px 10px" }}><ChevronRight size={16} /></button>
          <strong style={{ fontSize: 15, color: "#0f172a", marginLeft: 6 }}>{rangeLabel}</strong>
        </div>
        <div className="segmented-control" aria-label="Week length" style={{ fontSize: 13 }}>
          <button className="segment" type="button" aria-pressed={!fullWeek} onClick={() => setFullWeek(false)}>Work week</button>
          <button className="segment" type="button" aria-pressed={fullWeek} onClick={() => setFullWeek(true)}>Full week</button>
        </div>
      </div>

      {/* Legend + how-to */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 16, fontSize: 12, color: "var(--text-muted)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 22, height: 14, borderRadius: 4, border: "1px dashed #94a3b8", background: "#f8fafc", flexShrink: 0 }} />
          {apptMode ? "Assigned — not confirmed" : "Scheduled — not confirmed"}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 22, height: 14, borderRadius: 4, border: "1px solid var(--accent)", background: "var(--accent-soft)", flexShrink: 0 }} />
          Confirmed — {apptMode ? vocab.customerNoun.toLowerCase() : "crew"} emailed
        </span>
        {crews.length > 0 && (apptMode ? unassignedAppts.length > 0 : unscheduled.length > 0) && (
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, color: "var(--accent)", fontWeight: 600 }}>
            <GripVertical size={14} /> Drag {apptMode ? "a booking" : `a ${vocab.jobNoun.toLowerCase()}`} from the left onto any {vocab.resourceNoun.toLowerCase()} + day to schedule it.
          </span>
        )}
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, alignItems: "start" }}>
          {/* Needs-a-resource rail */}
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title" style={{ fontSize: 14 }}>
                {apptMode ? `Unassigned (${unassignedAppts.length})` : `Unscheduled (${unscheduled.length})`}
              </h2>
            </div>
            <div className="panel-body" style={{ display: "grid", gap: 8, maxHeight: 560, overflowY: "auto" }}>
              {apptMode ? (
                unassignedAppts.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#94a3b8" }}>
                    Every booking this week has a {vocab.resourceNoun.toLowerCase()} 🎉
                  </p>
                ) : (
                  unassignedAppts.map((a) => <ApptTile key={a.appointmentId} appt={a} tz={tz} />)
                )
              ) : unscheduled.length === 0 ? (
                <p style={{ fontSize: 13, color: "#94a3b8" }}>All {vocab.jobNounPlural.toLowerCase()} scheduled 🎉</p>
              ) : (
                unscheduled.map((job) => <JobTile key={job.jobId} job={job} crew={undefined} />)
              )}
            </div>
          </section>

          {/* Crew × day grid */}
          <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
            <div style={{ display: "grid", gridTemplateColumns: `140px repeat(${days.length}, minmax(150px, 1fr))`, minWidth: 700 }}>
              {/* Header row */}
              <div style={{ padding: "12px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 12, fontWeight: 700, color: "#64748b" }}>{vocab.resourceNoun}</div>
              {days.map((d) => {
                const isToday = sameDay(Date.now(), d, tz);
                return (
                  <div key={d.toISOString()} style={{ padding: "12px 8px", borderBottom: "1px solid #e2e8f0", borderLeft: "1px solid #f1f5f9", background: isToday ? "#eff6ff" : "#f8fafc", textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{DOW[d.getDay()]}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: isToday ? "var(--accent)" : "#0f172a" }}>{d.getDate()}</div>
                  </div>
                );
              })}

              {/* Bookings row — read-only context in jobs mode. In appointments mode
                  the bookings are the draggable cards, so this strip would just
                  duplicate the rows below it. */}
              {!apptMode && (
                <div style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#0369a1" }}>📅 Bookings</div>
              )}
              {!apptMode && days.map((d) => {
                const dayAppts = appts.filter((a) => sameDay(a.startTime, d, tz));
                return (
                  <div key={d.toISOString()} style={{ padding: "8px 6px", borderBottom: "1px solid #f1f5f9", borderLeft: "1px solid #f1f5f9", minHeight: 56, display: "grid", gap: 4 }}>
                    {dayAppts.map((a) => {
                      const pending = a.pendingConfirmation || a.status === "requested";
                      return (
                        <Link key={a.appointmentId} href={`/company/pipeline${previewSuffix ? previewSuffix + "&" : "?"}tab=appointments&appt=${a.appointmentId}`} style={{ textDecoration: "none" }}>
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
                  No {vocab.resourceNounPlural.toLowerCase()} yet.{" "}
                  <Link href={`/company/library${previewSuffix ? previewSuffix + "&section=crews" : "?section=crews"}`} style={{ color: "var(--accent)" }}>
                    Add {vocab.resourceNounPlural.toLowerCase()} in the Library →
                  </Link>
                </div>
              ) : (
                crews.map((crew) => (
                  <CrewRow
                    key={crew.crewId}
                    crew={crew}
                    days={days}
                    jobs={apptMode ? [] : jobs.filter((j) => j.assignedCrewId === crew.crewId && j.scheduledStart)}
                    appts={apptMode ? appts.filter((a) => a.assignedCrewId === crew.crewId) : []}
                    tz={tz}
                    onConfirm={confirmJob}
                    onUnschedule={unschedule}
                    onConfirmAppt={confirmAppt}
                    onUnassignAppt={unassignAppt}
                    confirmedAppts={confirmedAppts}
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

// ── Resource row (crew / tech / provider / vendor) with droppable day cells ───
function CrewRow({
  crew, days, jobs, appts, tz, onConfirm, onUnschedule, onConfirmAppt, onUnassignAppt, confirmedAppts, busyJob, previewSuffix,
}: {
  crew: Crew;
  days: Date[];
  jobs: Job[];
  appts: Appointment[];
  tz: string;
  onConfirm: (j: Job) => void;
  onUnschedule: (jobId: string) => void;
  onConfirmAppt: (a: Appointment) => void;
  onUnassignAppt: (appointmentId: string) => void;
  confirmedAppts: Set<string>;
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
          {jobs.filter((j) => j.scheduledStart && sameDay(j.scheduledStart, d, tz)).map((job) => (
            <ScheduledTile key={job.jobId} job={job} crew={crew} onConfirm={onConfirm} onUnschedule={onUnschedule} busy={busyJob === job.jobId} previewSuffix={previewSuffix} />
          ))}
          {appts.filter((a) => sameDay(a.startTime, d, tz)).map((appt) => (
            <ScheduledApptTile
              key={appt.appointmentId}
              appt={appt}
              crew={crew}
              tz={tz}
              onConfirm={onConfirmAppt}
              onUnassign={onUnassignAppt}
              busy={busyJob === appt.appointmentId}
              justConfirmed={confirmedAppts.has(appt.appointmentId)}
              previewSuffix={previewSuffix}
            />
          ))}
        </DayCell>
      ))}
    </>
  );
}

function DayCell({ crewId, day, children }: { crewId: string; day: Date; children: React.ReactNode }) {
  const id = `${crewId}|${day.getTime()}`;
  const { setNodeRef, isOver } = useDroppable({ id });
  const isEmpty = !children || (Array.isArray(children) && children.length === 0);
  return (
    <div ref={setNodeRef} style={{ padding: 6, borderBottom: "1px solid #f1f5f9", borderLeft: "1px solid #f1f5f9", minHeight: 64, background: isOver ? "var(--accent-soft)" : "transparent", boxShadow: isOver ? "inset 0 0 0 2px var(--accent)" : undefined, borderRadius: isOver ? 6 : 0, transition: "background 0.12s", display: "grid", gap: 4, alignContent: "start" }}>
      {children}
      {isEmpty && (
        <span style={{ fontSize: 10, color: isOver ? "var(--accent)" : "#cbd5e1", textAlign: "center", alignSelf: "center", fontWeight: isOver ? 700 : 500, pointerEvents: "none" }}>
          {isOver ? "Drop to schedule" : "+"}
        </span>
      )}
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
      title="Drag onto a crew + day"
      style={{
        padding: "8px 10px 8px 6px", borderRadius: 8, background: "#fff", border: "1px solid #e2e8f0",
        cursor: "grab", boxShadow: isDragging ? "0 8px 20px rgba(0,0,0,0.15)" : "0 1px 2px rgba(0,0,0,0.04)",
        opacity: isDragging ? 0.5 : 1, transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        touchAction: "none", display: "flex", gap: 6, alignItems: "flex-start",
      }}
    >
      <GripVertical size={14} style={{ color: "#cbd5e1", flexShrink: 0, marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: "#1e293b" }}>{job.jobId}</div>
        <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.3 }}>{job.title}</div>
        {job.address && <div style={{ fontSize: 11, color: "#94a3b8" }}>{job.address}</div>}
      </div>
    </div>
  );
}

// ── Draggable booking tile (unassigned rail) ──────────────────────────────────
function ApptTile({ appt, tz }: { appt: Appointment; tz: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: appt.appointmentId });
  const pending = appt.pendingConfirmation || appt.status === "requested";
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      title="Drag onto a row + day to assign"
      style={{
        padding: "8px 10px 8px 6px", borderRadius: 8, background: "#fff", border: "1px solid #e2e8f0",
        cursor: "grab", boxShadow: isDragging ? "0 8px 20px rgba(0,0,0,0.15)" : "0 1px 2px rgba(0,0,0,0.04)",
        opacity: isDragging ? 0.5 : 1, transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        touchAction: "none", display: "flex", gap: 6, alignItems: "flex-start",
      }}
    >
      <GripVertical size={14} style={{ color: "#cbd5e1", flexShrink: 0, marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>
          {new Date(appt.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}
          {" · "}
          {new Date(appt.startTime).toLocaleDateString("en-US", { weekday: "short", timeZone: tz })}
        </div>
        <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.3 }}>{appt.callerName ?? "Booking"}</div>
        {appt.serviceType && <div style={{ fontSize: 11, color: "#94a3b8" }}>{appt.serviceType}</div>}
        {pending && (
          <div style={{ fontSize: 9, fontWeight: 700, color: "#b45309", marginTop: 2 }}>UNCONFIRMED</div>
        )}
      </div>
    </div>
  );
}

// ── Placed booking tile (in a resource×day cell) ──────────────────────────────
function ScheduledApptTile({
  appt, crew, tz, onConfirm, onUnassign, busy, justConfirmed, previewSuffix,
}: {
  appt: Appointment;
  crew: Crew;
  tz: string;
  onConfirm: (a: Appointment) => void;
  onUnassign: (appointmentId: string) => void;
  busy: boolean;
  justConfirmed: boolean;
  previewSuffix: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: appt.appointmentId });
  const confirmed = appt.status === "confirmed" || justConfirmed;
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
      <div {...listeners} {...attributes} style={{ padding: "6px 8px", cursor: "grab", touchAction: "none", borderLeft: `3px solid ${confirmed ? crew.color : "#cbd5e1"}`, display: "flex", gap: 5, alignItems: "flex-start" }}>
        <GripVertical size={12} style={{ color: confirmed ? crew.color : "#cbd5e1", flexShrink: 0, marginTop: 1, opacity: 0.8 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: confirmed ? crew.color : "#64748b" }}>
            {new Date(appt.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}
          </div>
          <div style={{ fontSize: 11, color: "#334155", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {appt.callerName ?? "Booking"}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
        {!confirmed ? (
          <button onClick={() => onConfirm(appt)} disabled={busy} title="Emails the customer their confirmed time" style={{ flex: 1, fontSize: 11, fontWeight: 700, padding: "6px 4px", border: "none", background: "#16a34a", color: "#fff", cursor: "pointer" }}>
            {busy ? "Sending…" : "✓ Confirm + email"}
          </button>
        ) : (
          <Link href={`/company/pipeline${previewSuffix ? previewSuffix + "&" : "?"}tab=appointments&appt=${appt.appointmentId}`} style={{ flex: 1, fontSize: 10, fontWeight: 700, padding: "5px", textAlign: "center", color: crew.color, textDecoration: "none" }}>
            Open →
          </Link>
        )}
        <button onClick={() => onUnassign(appt.appointmentId)} title="Move back to Unassigned (does not cancel the booking)" style={{ fontSize: 11, padding: "4px 8px", border: "none", borderLeft: "1px solid rgba(0,0,0,0.06)", background: "transparent", color: "#94a3b8", cursor: "pointer" }}>⤺</button>
      </div>
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
      <div {...listeners} {...attributes} style={{ padding: "6px 8px", cursor: "grab", touchAction: "none", borderLeft: `3px solid ${confirmed ? crew.color : "#cbd5e1"}`, display: "flex", gap: 5, alignItems: "flex-start" }}>
        <GripVertical size={12} style={{ color: confirmed ? crew.color : "#cbd5e1", flexShrink: 0, marginTop: 1, opacity: 0.8 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: confirmed ? crew.color : "#64748b" }}>{job.jobId}</div>
          <div style={{ fontSize: 11, color: "#334155", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{job.title}</div>
        </div>
      </div>
      <div style={{ display: "flex", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
        {!confirmed ? (
          <button onClick={() => onConfirm(job)} disabled={busy} title="Emails this crew their assignment and locks the schedule" style={{ flex: 1, fontSize: 11, fontWeight: 700, padding: "6px 4px", border: "none", background: "#16a34a", color: "#fff", cursor: "pointer" }}>{busy ? "Sending…" : "✓ Confirm + email"}</button>
        ) : (
          <Link href={`/company/jobs/${job.jobId}${previewSuffix}`} style={{ flex: 1, fontSize: 10, fontWeight: 700, padding: "5px", textAlign: "center", color: crew.color, textDecoration: "none" }}>Open →</Link>
        )}
        <button onClick={() => { if (!confirmed || confirm("Unschedule this confirmed job? The crew was already emailed.")) onUnschedule(job.jobId); }} title="Move back to Unscheduled (does not delete the job)" style={{ fontSize: 11, padding: "4px 8px", border: "none", borderLeft: "1px solid rgba(0,0,0,0.06)", background: "transparent", color: "#94a3b8", cursor: "pointer" }}>⤺</button>
      </div>
    </div>
  );
}
