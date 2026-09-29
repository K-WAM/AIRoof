"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, pointerWithin, rectIntersection, type CollisionDetection, type DragEndEvent } from "@dnd-kit/core";

/**
 * A drop lands on the day under the finger/pointer — not the day the dragged CARD overlaps most (dnd-kit's default).
 * With the default, a card grabbed near one edge, or a page that scrolled mid-drag, dropped one day off (2026-09-28:
 * aimed at Wednesday, landed on Thursday). Overlap is only the fallback when the pointer is between cells.
 */
const dropUnderPointer: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : rectIntersection(args);
};
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clock3, GripVertical, Phone, Plus, Undo2, Users, X } from "lucide-react";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessTimezone } from "@/hooks/useBusinessTimezone";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import { useSearchParams } from "next/navigation";
import type { Job } from "@/types/jobs";
import type { Crew } from "@/types/library";
import type { TimeBlock } from "@/types/schedule";
import { BookingDetails } from "@/components/appointments/BookingDetails";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PageError } from "@/components/ui/PageError";
import { Tooltip } from "@/components/ui/Tooltip";
import { EmptyState } from "@/components/ui/EmptyState";
import { useWaitingRequests } from "@/hooks/useWaitingRequests";
import { useAuth } from "@/contexts/AuthContext";
import { useBootstrap } from "@/contexts/BootstrapContext";
import { useQuickAdd } from "@/contexts/QuickAddContext";
import { useQuickAddRefresh } from "@/lib/events/quickAdd";
import { runOptimisticCalendarMutation } from "./optimisticMutation";

interface Appointment {
  appointmentId: string;
  callerName?: string;
  callerPhone?: string;
  callerEmail?: string;
  address?: string;
  notes?: string;
  serviceType?: string;
  startTime: number;
  status: string;
  pendingConfirmation?: boolean;
  assignedCrewId?: string;
  assignedBy?: "ai" | "office";
  textOk?: boolean;
  callSummary?: string;
  /** Set once the office made a job from this booking (Pipeline → Create Job). */
  jobId?: string;
}

/** A drop (or "Change time") waiting for the dispatcher to pick a start time — T-149. */
interface SlotPickerState {
  jobId: string;
  crewId: string;
  day: Date;
  anchor: { top: number; left: number; width: number; height: number } | null;
}

const LENGTH_OPTIONS_MIN = [30, 60, 90, 120, 180, 240, 360, 480];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function lengthLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr`;
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

/**
 * Move a booking to another day without losing its time of day — a 10:30 cleaning
 * dragged to Thursday is still at 10:30. (A job dropped on a day opens the time picker
 * instead — see SlotPicker — whose open times come from the server's hours parser.)
 */
function sameTimeOnDay(existingMs: number, day: Date, timeZone: string): number | null {
  const time = dateParts(existingMs, timeZone);
  return wallTimeToUtc(day, time.hour, time.minute, timeZone);
}

// The heavy part of the Calendar route — everything @dnd-kit-dependent lives here
// so page.tsx can lazy-load it via next/dynamic (T-068) instead of shipping it in
// every route's initial bundle. No logic changed in this move, file split only.
export default function CalendarBoard() {
  const { user } = useAuth();
  const smsEnabled = useBootstrap().data?.business.smsEnabled === true;
  const businessId = useBusinessId();
  const tz = useBusinessTimezone();
  const { calendarMode, vocab, ready: modulesReady } = useBusinessModules();
  const { open: openQuickAdd } = useQuickAdd();
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
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [picker, setPicker] = useState<SlotPickerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [confirmedAppts, setConfirmedAppts] = useState<Set<string>>(new Set());
  const [blockForm, setBlockForm] = useState<{ crewId: string; label: string; start: string; end: string } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const days = useMemo(() => Array.from({ length: fullWeek ? 7 : 5 }, (_, i) => addDays(weekStart, i)), [weekStart, fullWeek]);

  useEffect(() => {
    // Wait for the industry so intake tenants never fire a jobs request.
    if (!businessId || !modulesReady) return;
    Promise.all([
      fetch(`/api/company/crews?businessId=${businessId}&people=1`).then((r) => {
        if (!r.ok) throw new Error("Resources request failed");
        return r.json();
      }),
      apptMode
        ? Promise.resolve({ jobs: [] })
        : fetch(`/api/jobs?businessId=${businessId}`).then((r) => {
            if (!r.ok) throw new Error("Jobs request failed");
            return r.json();
          }),
    ])
      .then(([cr, jr]) => {
        setCrews((cr.crews ?? []).filter((c: Crew) => c.active));
        setMemberCounts(countMembers(cr.people));
        setJobs((jr.jobs ?? []).filter((j: Job) => j.status !== "complete"));
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [businessId, modulesReady, apptMode]);

  // A crew added via the global quick-add (e.g. from the BlockedAction card
  // below) doesn't come from this page's own form — refetch in place instead
  // of requiring a reload to see it show up as a schedulable row.
  useQuickAddRefresh("crew", () => {
    if (!businessId) return;
    fetch(`/api/company/crews?businessId=${businessId}&people=1`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((cr) => {
        setCrews((cr.crews ?? []).filter((c: Crew) => c.active));
        setMemberCounts(countMembers(cr.people));
      })
      .catch(() => {});
  });

  // Same for a job created via the header's own "+ New" button below — without this, a
  // dispatcher who adds a job right from the Calendar wouldn't see it land in the Unscheduled
  // rail until a full page reload, which reads as "did that even work?"
  useQuickAddRefresh("job", () => {
    if (!businessId || apptMode) return;
    fetch(`/api/jobs?businessId=${businessId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((jr) => setJobs((jr.jobs ?? []).filter((j: Job) => j.status !== "complete")))
      .catch(() => {});
  });

  // Appointments for the visible window. In jobs mode they're a read-only
  // "Bookings" strip; in appointments mode they're the draggable cards.
  // T-072 (round-trip time): server-side admin-SDK read replacing a direct
  // client Firestore query — same fix already applied to Dashboard/Calls/
  // Pipeline/CommandBar (T-071); this was the last page still paying
  // browser->Firestore connection setup on every week change.
  useEffect(() => {
    if (!businessId) return;
    const startMs = weekStart.getTime();
    const endMs = addDays(weekStart, 7).getTime();
    let cancelled = false;
    fetch(`/api/businesses/${businessId}/appointments?from=${startMs}&to=${endMs}`)
      .then((r) => {
        if (!r.ok) throw new Error("Appointments request failed");
        return r.json();
      })
      .then((data: { appointments: Appointment[] }) => {
        if (cancelled) return;
        setAppts((data.appointments ?? []).filter((a) => a.status !== "cancelled"));
      })
      .catch(() => {
        if (cancelled) return;
        setAppts([]);
        setCalendarError("Appointments could not be loaded. Refresh the calendar and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, weekStart]);

  useEffect(() => {
    if (!businessId) return;
    const from = weekStart.getTime();
    const to = addDays(weekStart, 7).getTime();
    fetch(`/api/company/time-blocks?businessId=${businessId}&from=${from}&to=${to}`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { blocks?: TimeBlock[] }) => setBlocks(data.blocks ?? []))
      .catch(() => setCalendarError("Blocked time could not be loaded. Refresh the calendar and try again."));
  }, [businessId, weekStart]);

  // The rail holds whatever still needs a resource: jobs with no crew/day,
  // or bookings the agent took that nobody has been assigned to yet.
  // A job whose crew is not on the board (removed, or turned off in Library) counts as unscheduled too — before
  // T-148 it sat on no row and in no rail, so it vanished from the Calendar.
  const boardCrewIds = new Set(crews.map((crew) => crew.crewId));
  const unscheduled = jobs.filter((j) => !j.scheduledStart || !j.assignedCrewId || !boardCrewIds.has(j.assignedCrewId));
  const unassignedAppts = appts.filter((a) => !a.assignedCrewId);
  const inspectors = crews.filter((crew) => crew.kind === "inspector");
  const workCrews = crews.filter((crew) => crew.kind !== "inspector");
  const orderedCrews = apptMode ? crews : [...inspectors, ...workCrews];

  // Empty states (docs/NO-TRAINING-UX-PLAN.md §3.3): no resources → "Add your first …"; resources but
  // nothing at all to place → "Nothing to schedule", pointing at waiting requests when there are any.
  const readOnly = user?.role === "viewer";
  const nothingToSchedule = !loading && (apptMode
    ? appts.length === 0
    : jobs.length === 0 && (inspectors.length === 0 || unassignedAppts.length === 0));
  const waitingRequests = useWaitingRequests(businessId, !apptMode && !readOnly && crews.length > 0 && nothingToSchedule);
  const emptyStateOwnsPrimary = !loading && (crews.length === 0 || (nothingToSchedule && waitingRequests > 0));

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  // Saves a time picked in the SlotPicker. Grey/unconfirmed until "Confirm + email crew", as before.
  async function placeJob(jobId: string, crewId: string, dayMs: number, durationMs: number) {
    const previous = jobs.find((job) => job.jobId === jobId);
    if (!previous) return;
    setPicker(null);
    const scheduledEnd = dayMs + Math.max(durationMs, 1);
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
          setCalendarError("The assignment is saved, but a crew email failed. Try Confirm again to retry delivery.");
        } else {
          const count = typeof data.emailedCount === "number" ? data.emailedCount : data.emailed ? 1 : 0;
          flash(count > 0
            ? `Crew confirmed & ${count} email${count === 1 ? "" : "s"} sent ✓`
            : "Crew confirmed (no crew or member email on file)");
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
    if (!sameDay(appt.startTime, day, tz)) {
      const from = new Date(appt.startTime).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: tz });
      const to = new Date(startTime).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: tz });
      const customer = appt.callerName ? `${appt.callerName}${appt.callerName.endsWith("s") ? "'" : "'s"}` : "this customer's";
      if (!window.confirm(`This moves ${customer} booking from ${from} to ${to} — they're told when you confirm.`)) return;
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
      persist: async () => {
        const save = (force = false) => fetch(`/api/appointments/${appointmentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessId, assignedCrewId: crewId, startTime, ...(force ? { force: true } : {}) }),
        });
        let response = await save();
        if (response.status === 409) {
          const data = await response.clone().json().catch(() => ({} as { code?: string; message?: string }));
          if (data.code === "inspector_busy" && window.confirm(`${data.message || "That inspector is busy then."}\n\nAssign anyway?`)) {
            response = await save(true);
          }
        }
        return response;
      },
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
      const notifyChannel = smsEnabled && appt.callerPhone && appt.textOk !== false ? "sms" : appt.callerEmail ? "email" : "none";
      const res = await fetch(`/api/appointments/${appt.appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, confirm: true, notifyCustomer: notifyChannel !== "none", notifyChannel }),
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
        const customer = data.notifiedVia ? `${vocab.customerNoun.toLowerCase()} ${data.notifiedVia === "sms" ? "texted" : "emailed"}` : `${vocab.customerNoun.toLowerCase()} not notified`;
        const inspector = data.staffNotified ? ` · ${crews.find((crew) => crew.crewId === appt.assignedCrewId)?.name ?? "inspector"} notified` : "";
        flash(`Confirmed · ${customer}${inspector}`);
      } else {
        setCalendarError(data.error ?? "The appointment could not be confirmed. Try again.");
      }
    } catch {
      setCalendarError("The appointment could not be confirmed. Check your connection and try again.");
    } finally {
      setBusyJob(null);
    }
  }

  function openBlockForm(crewId: string) {
    const start = new Date();
    start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const local = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    setBlockForm({ crewId, label: "", start: local(start), end: local(end) });
  }

  async function saveBlock() {
    if (!blockForm || !businessId) return;
    const startTime = Date.parse(blockForm.start);
    const endTime = Date.parse(blockForm.end);
    if (!blockForm.label.trim() || !Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
      setCalendarError("Add a label and an end time after the start time.");
      return;
    }
    const response = await fetch("/api/company/time-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, crewId: blockForm.crewId, label: blockForm.label, startTime, endTime }),
    });
    const data = await response.json().catch(() => ({} as { block?: TimeBlock; error?: string }));
    if (!response.ok || !data.block) {
      setCalendarError(data.error ?? "Blocked time could not be saved.");
      return;
    }
    setBlocks((current) => [...current, data.block!]);
    setBlockForm(null);
    flash("Blocked time added");
  }

  async function deleteBlock(blockId: string) {
    if (!businessId) return;
    const response = await fetch(`/api/company/time-blocks?businessId=${businessId}&blockId=${encodeURIComponent(blockId)}`, { method: "DELETE" });
    if (!response.ok) {
      setCalendarError("Blocked time could not be removed.");
      return;
    }
    setBlocks((current) => current.filter((block) => block.blockId !== blockId));
  }

  function onDragEnd(e: DragEndEvent) {
    const dragId = String(e.active.id);
    const id = dragId.replace(/^(?:appointment-rail|phone-strip):/, "");
    const over = e.over?.id as string | undefined;
    if (!over) return;
    const [crewId, dayStr] = over.split("|");
    const day = new Date(Number(dayStr));
    const target = crews.find((crew) => crew.crewId === crewId);
    const isAppointment = appts.some((appointment) => appointment.appointmentId === id);
    if (!apptMode && isAppointment && target?.kind !== "inspector") {
      setCalendarError("Drag bookings onto an inspector, jobs onto a crew.");
      return;
    }
    if (!apptMode && !isAppointment && target?.kind === "inspector") {
      setCalendarError("Drag bookings onto an inspector, jobs onto a crew.");
      return;
    }
    if (apptMode || isAppointment) {
      placeAppt(id, crewId, day);
      return;
    }
    if (readOnly) return;
    // A cell is a whole day, so a drop carries no time — ask for one (T-149). Before, every drop landed at opening
    // time, and a second job on the same crew-day collided with the first and was refused.
    const rect = e.over?.rect;
    setPicker({ jobId: id, crewId, day, anchor: rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : null });
  }

  function openChangeTime(job: Job) {
    if (!job.assignedCrewId || !job.scheduledStart) return;
    const parts = dateParts(job.scheduledStart, tz);
    setPicker({ jobId: job.jobId, crewId: job.assignedCrewId, day: new Date(parts.year, parts.month - 1, parts.day), anchor: null });
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
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CalendarDays size={20} strokeWidth={1.75} />
            Calendar
          </h1>
          <p className="page-subtitle">
            {apptMode
              ? `Your scheduling board — drag a booking onto a ${vocab.resourceNoun.toLowerCase()} and day, then confirm to notify the ${vocab.customerNoun.toLowerCase()}.`
              : "Drag bookings onto inspectors and jobs onto crews, then confirm to send the right notifications."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {toast && <span role="status" className="status-pill" style={{ background: "#f0fdf4", color: "#15803d", borderColor: "#86efac" }}>{toast}</span>}
          {/* Stays primary unless an empty state below owns the screen's one primary action. */}
          {!apptMode && !readOnly && (
            <button className={`button small${emptyStateOwnsPrimary ? "" : " primary"}`} type="button" onClick={() => openQuickAdd("job")} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Plus size={13} strokeWidth={1.75} />
              New {vocab.jobNoun.toLowerCase()}
            </button>
          )}
          <Link href={`/company/library${previewSuffix ? previewSuffix + "&section=crews" : "?section=crews"}`} className="button small" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Plus size={13} strokeWidth={1.75} />
            Manage {vocab.resourceNounPlural.toLowerCase()}
          </Link>
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
          <button className="button small" onClick={() => setWeekStart(startOfWeek(new Date()))} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Clock3 size={13} strokeWidth={1.75} />
            Today
          </button>
          <Tooltip content="Previous week">
            <button className="button small" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))} style={{ display: "flex", alignItems: "center", padding: "6px 10px" }}><ChevronLeft size={16} /></button>
          </Tooltip>
          <Tooltip content="Next week">
            <button className="button small" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))} style={{ display: "flex", alignItems: "center", padding: "6px 10px" }}><ChevronRight size={16} /></button>
          </Tooltip>
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
          Confirmed — {apptMode ? vocab.customerNoun.toLowerCase() : vocab.resourceNoun.toLowerCase()} emailed
        </span>
        {crews.length > 0 && (apptMode ? unassignedAppts.length > 0 : unscheduled.length > 0 || (inspectors.length > 0 && unassignedAppts.length > 0)) && (
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, color: "var(--accent)", fontWeight: 600 }}>
            <GripVertical size={14} /> {apptMode ? `Drag a booking onto any ${vocab.resourceNoun.toLowerCase()} + day.` : "Drag bookings onto inspectors and jobs onto crews."}
          </span>
        )}
      </div>

      {/* No resources yet: the next step replaces the board — an empty grid with nothing to drag onto is a locked door. */}
      {crews.length === 0 ? (
        <section className="panel">
          <EmptyState
            icon={Users}
            title={`Add your first ${vocab.resourceNoun.toLowerCase()}`}
            body={readOnly
              ? `Ask the owner to add your ${vocab.resourceNounPlural.toLowerCase()}.`
              : `Then drag ${apptMode ? "bookings" : vocab.jobNounPlural.toLowerCase()} onto their day.`}
            action={readOnly ? undefined : { label: `Add ${vocab.resourceNoun.toLowerCase()}`, onClick: () => openQuickAdd("crew") }}
            testId="calendar-no-resources"
          />
        </section>
      ) : (
      <DndContext sensors={sensors} collisionDetection={dropUnderPointer} onDragEnd={onDragEnd}>
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, alignItems: "start" }}>
          {/* Needs-a-resource rail */}
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title" style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                <CalendarClock size={15} strokeWidth={1.75} />
                {apptMode ? `Unassigned (${unassignedAppts.length})` : `Unscheduled (${unscheduled.length})`}
              </h2>
            </div>
            {!apptMode && !nothingToSchedule && (
              <p style={{ margin: 0, padding: "10px 16px 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45 }} data-testid="calendar-unscheduled-help">
                {vocab.jobNounPlural} with no {vocab.resourceNoun.toLowerCase()} or time yet. Drag one onto a {vocab.resourceNoun.toLowerCase()} and day.
              </p>
            )}
            <div className="panel-body" style={{ display: "grid", gap: 10, maxHeight: 680, overflowY: "auto" }}>
              {crews.length > 0 && nothingToSchedule ? (
                <EmptyState
                  compact
                  title="Nothing to schedule"
                  body={apptMode
                    ? "Bookings the AI takes show up here to assign."
                    : `${vocab.jobNounPlural} you create show up here to drag onto a day.`}
                  action={!readOnly && !apptMode && waitingRequests > 0
                    ? { label: `Review requests (${waitingRequests})`, href: `/company/pipeline${previewSuffix}` }
                    : undefined}
                  testId="calendar-nothing-to-schedule"
                />
              ) : apptMode ? (
                unassignedAppts.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    Every booking this week has a {vocab.resourceNoun.toLowerCase()} 🎉
                  </p>
                ) : (
                  unassignedAppts.map((a) => <ApptTile key={a.appointmentId} appt={a} tz={tz} />)
                )
              ) : (
                <>
                  {inspectors.length > 0 && unassignedAppts.length > 0 && <>
                    <strong style={{ fontSize: 12 }}>Phone bookings</strong>
                    {unassignedAppts.map((appointment) => <ApptTile key={appointment.appointmentId} appt={appointment} tz={tz} />)}
                  </>}
                  {unscheduled.length > 0 && <strong style={{ fontSize: 12, marginTop: 6 }}>{vocab.jobNounPlural}</strong>}
                  {unscheduled.map((job) => (
                    <JobTile key={job.jobId} job={job} tz={tz} crewGone={!!job.assignedCrewId && !!job.scheduledStart && !boardCrewIds.has(job.assignedCrewId)} />
                  ))}
                  {unscheduled.length === 0 && (inspectors.length === 0 || unassignedAppts.length === 0) && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Everything is scheduled 🎉</p>}
                </>
              )}
            </div>
          </section>

          {/* Crew × day grid */}
          <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 14, background: "#fff" }}>
            <div style={{ display: "grid", gridTemplateColumns: `168px repeat(${days.length}, minmax(190px, 1fr))`, minWidth: 900 }}>
              {/* Header row */}
              <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 12.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>{vocab.resourceNoun}</div>
              {days.map((d) => {
                const isToday = sameDay(Date.now(), d, tz);
                return (
                  <div key={d.toISOString()} style={{ padding: "10px 8px", borderBottom: "1px solid #e2e8f0", borderLeft: "1px solid #f1f5f9", background: isToday ? "#eff6ff" : "#f8fafc", textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{DOW[d.getDay()]}</div>
                    <div
                      style={{
                        fontSize: 19, fontWeight: 700, color: isToday ? "#fff" : "#0f172a",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 32, height: 32, borderRadius: "50%", marginTop: 2,
                        background: isToday ? "var(--accent)" : "transparent",
                      }}
                    >
                      {d.getDate()}
                    </div>
                  </div>
                );
              })}

              {/* Bookings row — read-only context in jobs mode. In appointments mode
                  the bookings are the draggable cards, so this strip would just
                  duplicate the rows below it. */}
              {/* Owner feedback 2026-09-28: this must not look like one more crew. A tinted band, a phone icon,
                  "Phone bookings" + what it is, pill chips with no crew color and no Confirm button, and a heavier
                  divider before the first crew. */}
              {!apptMode && (
                <div data-testid="calendar-bookings-row" style={{ padding: "12px 16px", borderBottom: "2px solid #cbd5e1", background: "#f0f9ff", display: "grid", gap: 2, alignContent: "center" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "#0369a1" }}>
                    <Phone size={14} strokeWidth={1.75} />
                    Phone bookings
                  </span>
                  <span style={{ fontSize: 11, color: "#64748b", lineHeight: 1.35 }}>Booked by your AI — not a {vocab.resourceNoun.toLowerCase()}</span>
                </div>
              )}
              {!apptMode && days.map((d) => {
                const dayAppts = unassignedAppts.filter((a) => sameDay(a.startTime, d, tz));
                return (
                  <div key={d.toISOString()} style={{ padding: "8px 8px", borderBottom: "2px solid #cbd5e1", borderLeft: "1px solid #e0f2fe", background: "#f0f9ff", minHeight: 64, display: "grid", gap: 4, alignContent: "start" }}>
                    {dayAppts.map((a) => {
                      const pending = a.pendingConfirmation || a.status === "requested";
                      return (
                        <PhoneBookingChip key={a.appointmentId} appt={a} tz={tz} pending={pending} />
                      );
                    })}
                  </div>
                );
              })}

              {/* Crew rows */}
              {orderedCrews.map((crew, index) => (
                <Fragment key={crew.crewId}>
                  {!apptMode && (index === 0 || orderedCrews[index - 1]?.kind !== crew.kind) && (
                    <div style={{ gridColumn: "1 / -1", padding: "8px 16px", background: "var(--surface-muted, #f8fafc)", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {crew.kind === "inspector" ? "Inspectors" : "Crews"}
                    </div>
                  )}
                  <CrewRow
                    crew={crew}
                    days={days}
                    jobs={apptMode || crew.kind === "inspector" ? [] : jobs.filter((j) => j.assignedCrewId === crew.crewId && j.scheduledStart)}
                    appts={apptMode || crew.kind === "inspector" ? appts.filter((a) => a.assignedCrewId === crew.crewId) : []}
                    blocks={blocks.filter((block) => block.crewId === crew.crewId)}
                    tz={tz}
                    memberCount={apptMode ? 0 : memberCounts[crew.crewId] ?? 0}
                    onConfirm={confirmJob}
                    onChangeTime={readOnly ? undefined : openChangeTime}
                    onUnschedule={unschedule}
                    onConfirmAppt={confirmAppt}
                    onUnassignAppt={unassignAppt}
                    confirmedAppts={confirmedAppts}
                    busyJob={busyJob}
                    previewSuffix={previewSuffix}
                    smsEnabled={smsEnabled}
                    readOnly={readOnly}
                    onAddBlock={openBlockForm}
                    onDeleteBlock={deleteBlock}
                  />
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      </DndContext>
      )}
      {picker && businessId && (() => {
        const job = jobs.find((candidate) => candidate.jobId === picker.jobId);
        const crew = crews.find((candidate) => candidate.crewId === picker.crewId);
        if (!job || !crew) return null;
        return (
          <SlotPicker
            key={`${picker.jobId}|${picker.crewId}|${picker.day.getTime()}`}
            businessId={businessId}
            job={job}
            crew={crew}
            day={picker.day}
            anchor={picker.anchor}
            tz={tz}
            onPick={(start, durationMs) => placeJob(job.jobId, crew.crewId, start, durationMs)}
            onClose={() => setPicker(null)}
          />
        );
      })()}
      {blockForm && (
        <div role="dialog" aria-modal="true" aria-label="Block time" style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(15,23,42,0.45)", display: "grid", placeItems: "center", padding: 16 }}>
          <div className="panel" style={{ width: "min(460px, 100%)", padding: 20 }}>
            <h2 style={{ marginTop: 0 }}>Block time</h2>
            <div className="form-grid">
              <div className="field full"><label>Label</label><input value={blockForm.label} onChange={(event) => setBlockForm({ ...blockForm, label: event.target.value })} placeholder="Site visit, Materials pickup, Office, Off" /></div>
              <div className="field"><label>Start</label><input type="datetime-local" value={blockForm.start} onChange={(event) => setBlockForm({ ...blockForm, start: event.target.value })} /></div>
              <div className="field"><label>End</label><input type="datetime-local" value={blockForm.end} onChange={(event) => setBlockForm({ ...blockForm, end: event.target.value })} /></div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}><button className="button primary" type="button" onClick={() => void saveBlock()}>Add block</button><button className="button" type="button" onClick={() => setBlockForm(null)}>Cancel</button></div>
          </div>
        </div>
      )}
    </>
  );
}

function countMembers(people: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!Array.isArray(people)) return counts;
  for (const person of people as Array<{ crewId?: string }>) {
    if (person.crewId) counts[person.crewId] = (counts[person.crewId] ?? 0) + 1;
  }
  return counts;
}

// ── Time picker shown after a job is dropped on a crew + day (T-149) ─────────────
// The open start times come from GET /api/company/crews/open-times (the business's own hours and time zone, minus the
// crew's jobs and bookings). Picking one saves it exactly like the old drop did — grey until "Confirm + email crew".
function SlotPicker({
  businessId, job, crew, day, anchor, tz, onPick, onClose,
}: {
  businessId: string;
  job: Job;
  crew: Crew;
  day: Date;
  anchor: SlotPickerState["anchor"];
  tz: string;
  onPick: (start: number, durationMs: number) => void;
  onClose: () => void;
}) {
  const currentLengthMin = job.scheduledStart && job.scheduledEnd
    ? Math.round((job.scheduledEnd - job.scheduledStart) / 60000)
    : job.requestedStart && job.requestedEnd
      ? Math.round((job.requestedEnd - job.requestedStart) / 60000)
      : 60;
  const lengthOptions = LENGTH_OPTIONS_MIN.includes(currentLengthMin) || currentLengthMin < 15 || currentLengthMin > 720
    ? LENGTH_OPTIONS_MIN
    : [...LENGTH_OPTIONS_MIN, currentLengthMin].sort((a, b) => a - b);
  const [lengthMin, setLengthMin] = useState(currentLengthMin >= 15 && currentLengthMin <= 720 ? currentLengthMin : 60);
  const [result, setResult] = useState<{
    loading: boolean;
    starts: number[];
    reason: string | null;
    nextOpen: { day: string; start: number } | null;
    error: string | null;
  }>({ loading: true, starts: [], reason: null, nextOpen: null, error: null });
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    setNarrow(window.innerWidth < 640);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let live = true;
    setResult((current) => ({ ...current, loading: true, error: null }));
    const query = new URLSearchParams({ businessId, crewId: crew.crewId, day: dayKey(day), durationMin: String(lengthMin), jobId: job.jobId });
    fetch(`/api/company/crews/open-times?${query}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Open times could not be loaded");
        return data;
      })
      .then((data) => {
        if (!live) return;
        setResult({ loading: false, starts: data.starts ?? [], reason: data.reason ?? null, nextOpen: data.nextOpen ?? null, error: null });
      })
      .catch((error) => {
        if (!live) return;
        setResult({ loading: false, starts: [], reason: null, nextOpen: null, error: error instanceof Error ? error.message : "Open times could not be loaded" });
      });
    return () => { live = false; };
  }, [businessId, crew.crewId, day, lengthMin, job.jobId]);

  const timeLabel = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  const dayLabel = day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  // The time to highlight: where the tile already sits (moving it) or the time the caller booked.
  const hint = job.scheduledStart ?? job.requestedStart;
  const hintParts = hint ? dateParts(hint, tz) : null;
  const hintKind = job.scheduledStart ? "current" : "booked";
  const isHint = (ms: number) => {
    if (!hintParts) return false;
    const parts = dateParts(ms, tz);
    return parts.hour === hintParts.hour && parts.minute === hintParts.minute;
  };
  const emptyMessage = result.reason === "no_hours"
    ? "Set your business hours in Settings first — open times come from them."
    : result.reason === "closed"
      ? `You're closed on ${day.toLocaleDateString("en-US", { weekday: "long" })}s.`
      : result.reason === "past"
        ? "That day has already passed."
        : `${crew.name} has no open time on ${dayLabel} for ${lengthLabel(lengthMin)}.`;

  const width = 320;
  const panelStyle: React.CSSProperties = narrow
    ? { position: "fixed", left: 0, right: 0, bottom: 0, maxHeight: "75vh", borderRadius: "16px 16px 0 0" }
    : anchor
      ? {
          position: "fixed", width,
          left: Math.max(16, Math.min(anchor.left + anchor.width / 2 - width / 2, (typeof window === "undefined" ? 1280 : window.innerWidth) - width - 16)),
          top: Math.max(16, Math.min(anchor.top + 24, (typeof window === "undefined" ? 800 : window.innerHeight) - 460)),
          maxHeight: "min(440px, calc(100vh - 32px))", borderRadius: 12,
        }
      : { position: "fixed", width, left: "50%", top: "50%", transform: "translate(-50%, -50%)", maxHeight: "min(440px, calc(100vh - 32px))", borderRadius: 12 };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 40, background: narrow ? "rgba(15,23,42,0.35)" : "transparent" }} />
      <div
        role="dialog"
        aria-label={`Pick a time for ${job.title}`}
        data-testid="calendar-slot-picker"
        style={{ ...panelStyle, zIndex: 41, background: "#fff", border: "1px solid var(--border)", boxShadow: "0 16px 40px rgba(15,23,42,0.22)", display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        <div style={{ padding: "12px 14px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: crew.color, flexShrink: 0 }} />
              {crew.name} · {dayLabel}
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{job.title}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cancel" style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8", padding: 4, minWidth: 32, minHeight: 32 }}>
            <X size={16} />
          </button>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px 4px", fontSize: 12, fontWeight: 600, color: "#475569" }}>
          How long
          <select aria-label="How long" value={lengthMin} onChange={(event) => setLengthMin(Number(event.target.value))} style={{ fontSize: 13, minHeight: 36 }}>
            {lengthOptions.map((minutes) => <option key={minutes} value={minutes}>{lengthLabel(minutes)}</option>)}
          </select>
        </label>
        <div style={{ padding: "8px 14px 14px", overflowY: "auto" }}>
          {result.loading ? (
            <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Finding open times…</p>
          ) : result.error ? (
            <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>{result.error}</p>
          ) : result.starts.length === 0 ? (
            <div style={{ display: "grid", gap: 10 }}>
              <p style={{ margin: 0, fontSize: 13, color: "#334155" }}>{emptyMessage}</p>
              {result.nextOpen && (
                <button type="button" className="button primary" onClick={() => onPick(result.nextOpen!.start, lengthMin * 60000)} style={{ minHeight: 44 }}>
                  Next opening: {new Date(result.nextOpen.start).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz })} · {timeLabel(result.nextOpen.start)}
                </button>
              )}
            </div>
          ) : (
            <>
              <p style={{ margin: "0 0 8px", fontSize: 12, color: "#64748b" }}>Open times for {crew.name}:</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
                {result.starts.map((start) => {
                  const highlighted = isHint(start);
                  return (
                    <button
                      key={start}
                      type="button"
                      className={`button small${highlighted ? " primary" : ""}`}
                      onClick={() => onPick(start, lengthMin * 60000)}
                      title={highlighted ? (hintKind === "current" ? "Its current time" : "The time the customer booked") : undefined}
                      style={{ minHeight: 40, justifyContent: "center", fontVariantNumeric: "tabular-nums" }}
                    >
                      {timeLabel(start)}
                    </button>
                  );
                })}
              </div>
              {hintParts && result.starts.some(isHint) && (
                <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "#64748b" }}>
                  Highlighted: {hintKind === "current" ? "its current time" : "the time the customer booked"}.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
// ── Resource row (crew / tech / provider / vendor) with droppable day cells ───
function CrewRow({
  crew, days, jobs, appts, blocks, tz, memberCount, onConfirm, onChangeTime, onUnschedule, onConfirmAppt, onUnassignAppt, confirmedAppts, busyJob, previewSuffix, smsEnabled, readOnly, onAddBlock, onDeleteBlock,
}: {
  crew: Crew;
  days: Date[];
  jobs: Job[];
  appts: Appointment[];
  blocks: TimeBlock[];
  tz: string;
  memberCount: number;
  onConfirm: (j: Job) => void;
  onChangeTime?: (j: Job) => void;
  onUnschedule: (jobId: string) => void;
  onConfirmAppt: (a: Appointment) => void;
  onUnassignAppt: (appointmentId: string) => void;
  confirmedAppts: Set<string>;
  busyJob: string | null;
  previewSuffix: string;
  smsEnabled: boolean;
  readOnly: boolean;
  onAddBlock: (crewId: string) => void;
  onDeleteBlock: (blockId: string) => void;
}) {
  return (
    <>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ width: 13, height: 13, borderRadius: "50%", background: crew.color, flexShrink: 0, boxShadow: `0 0 0 3px ${crew.color}22` }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", lineHeight: 1.3 }}>
          {crew.name}
          {memberCount > 0 && (
            <span style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#94a3b8" }}>{memberCount} member{memberCount === 1 ? "" : "s"}</span>
          )}
        </span>
        {!readOnly && <button className="button small" type="button" onClick={() => onAddBlock(crew.crewId)} style={{ marginLeft: "auto" }}>＋ Block time</button>}
      </div>
      {days.map((d) => (
        <DayCell key={d.toISOString()} crewId={crew.crewId} day={d}>
          {jobs.filter((j) => j.scheduledStart && sameDay(j.scheduledStart, d, tz)).map((job) => (
            <ScheduledTile key={job.jobId} job={job} crew={crew} tz={tz} onConfirm={onConfirm} onChangeTime={onChangeTime} onUnschedule={onUnschedule} busy={busyJob === job.jobId} previewSuffix={previewSuffix} />
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
              smsEnabled={smsEnabled}
            />
          ))}
          {blocks.filter((block) => sameDay(block.startTime, d, tz)).map((block) => (
            <div key={block.blockId} style={{ padding: "7px 8px", borderRadius: 8, border: "1px solid #94a3b8", background: "repeating-linear-gradient(135deg, #f1f5f9, #f1f5f9 6px, #e2e8f0 6px, #e2e8f0 12px)", fontSize: 11.5, color: "#334155" }}>
              <div style={{ display: "flex", gap: 6, justifyContent: "space-between" }}><strong>{block.label}</strong>{!readOnly && <button type="button" aria-label={`Remove ${block.label} block`} onClick={() => onDeleteBlock(block.blockId)} style={{ border: 0, background: "transparent", cursor: "pointer", padding: 0 }}><X size={14} /></button>}</div>
              <span>{new Date(block.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}–{new Date(block.endTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}</span>
            </div>
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
    <div ref={setNodeRef} data-testid={`calendar-cell-${crewId}-${dayKey(day)}`} style={{ padding: 8, borderBottom: "1px solid #f1f5f9", borderLeft: "1px solid #f1f5f9", minHeight: 116, background: isOver ? "var(--accent-soft)" : "transparent", boxShadow: isOver ? "inset 0 0 0 2px var(--accent)" : undefined, borderRadius: isOver ? 8 : 0, transition: "background 0.12s", display: "grid", gap: 6, alignContent: "start" }}>
      {children}
      {isEmpty && (
        <span style={{ fontSize: 12, color: isOver ? "var(--accent)" : "#cbd5e1", textAlign: "center", alignSelf: "center", fontWeight: isOver ? 700 : 500, pointerEvents: "none" }}>
          {isOver ? "Drop to schedule" : "+"}
        </span>
      )}
    </div>
  );
}

// ── Draggable job tile (unscheduled rail) ─────────────────────────────────────
function JobTile({ job, tz, crewGone }: { job: Job; tz: string; crewGone: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: job.jobId });
  const booked = job.requestedStart
    ? `${new Date(job.requestedStart).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz })} · ${new Date(job.requestedStart).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}`
    : null;
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      title="Drag onto a crew + day"
      style={{
        padding: "10px 12px 10px 8px", borderRadius: 10, background: "#fff", border: "1px solid #e2e8f0",
        cursor: "grab", boxShadow: isDragging ? "0 8px 20px rgba(0,0,0,0.15)" : "0 1px 2px rgba(0,0,0,0.04)",
        opacity: isDragging ? 0.5 : 1, transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        touchAction: "none", display: "flex", gap: 7, alignItems: "flex-start",
      }}
    >
      <GripVertical size={15} style={{ color: "#cbd5e1", flexShrink: 0, marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.35, fontWeight: 600 }}>{job.title}</div>
        {job.address && <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 1 }}>{job.address}</div>}
        {booked && <div style={{ fontSize: 11.5, fontWeight: 600, color: "#0369a1", marginTop: 3 }}>Customer booked: {booked}</div>}
        {crewGone && <div style={{ fontSize: 11.5, fontWeight: 600, color: "#b45309", marginTop: 3 }}>Its crew was removed or turned off — drag it to another crew</div>}
        <div style={{ fontSize: 10.5, fontWeight: 600, fontFamily: "monospace", color: "#cbd5e1", marginTop: 3 }}>{job.jobId}</div>
      </div>
    </div>
  );
}

// ── Draggable booking tile (unassigned rail) ──────────────────────────────────
function PhoneBookingChip({ appt, tz, pending }: { appt: Appointment; tz: string; pending: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `phone-strip:${appt.appointmentId}` });
  return (
    <div ref={setNodeRef} style={{ position: "relative", transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined, opacity: isDragging ? 0.5 : 1 }}>
      <button type="button" {...listeners} {...attributes} style={{ width: "100%", textAlign: "left", cursor: "grab", touchAction: "none", fontSize: 12, padding: "5px 10px", borderRadius: 999, background: pending ? "#fff" : "#e0f2fe", color: pending ? "#64748b" : "#075985", border: pending ? "1px dashed #94a3b8" : "1px solid #bae6fd", lineHeight: 1.35 }}>
        <GripVertical size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
        <strong>{new Date(appt.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}</strong> {appt.callerName ?? "Booking"}
      </button>
      <details style={{ marginTop: 3 }}>
        <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--accent)", paddingLeft: 8 }}>Booking details</summary>
        <div style={{ marginTop: 4, padding: 8, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, minWidth: 230 }}><BookingDetails booking={appt} timeZone={tz} compact /></div>
      </details>
    </div>
  );
}

function ApptTile({ appt, tz }: { appt: Appointment; tz: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `appointment-rail:${appt.appointmentId}` });
  const pending = appt.pendingConfirmation || appt.status === "requested";
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-testid={`unassigned-appointment-${appt.appointmentId}`}
      title="Drag onto a row + day to assign"
      style={{
        padding: "10px 12px 10px 8px", borderRadius: 10, background: "#fff", border: "1px solid #e2e8f0",
        cursor: "grab", boxShadow: isDragging ? "0 8px 20px rgba(0,0,0,0.15)" : "0 1px 2px rgba(0,0,0,0.04)",
        opacity: isDragging ? 0.5 : 1, transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        touchAction: "none", display: "flex", gap: 7, alignItems: "flex-start",
      }}
    >
      <GripVertical size={15} style={{ color: "#cbd5e1", flexShrink: 0, marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
          {new Date(appt.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}
          {" · "}
          {new Date(appt.startTime).toLocaleDateString("en-US", { weekday: "short", timeZone: tz })}
        </div>
        <div style={{ fontSize: 12.5, color: "#334155", lineHeight: 1.35, marginTop: 1 }}>{appt.callerName ?? "Booking"}</div>
        {appt.serviceType && <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 1 }}>{appt.serviceType}</div>}
        {pending && (
          <div style={{ fontSize: 10, fontWeight: 700, color: "#b45309", marginTop: 3 }}>UNCONFIRMED</div>
        )}
      </div>
    </div>
  );
}

// ── Placed booking tile (in a resource×day cell) ──────────────────────────────
function ScheduledApptTile({
  appt, crew, tz, onConfirm, onUnassign, busy, justConfirmed, previewSuffix, smsEnabled,
}: {
  appt: Appointment;
  crew: Crew;
  tz: string;
  onConfirm: (a: Appointment) => void;
  onUnassign: (appointmentId: string) => void;
  busy: boolean;
  justConfirmed: boolean;
  previewSuffix: string;
  smsEnabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: appt.appointmentId });
  const confirmed = appt.status === "confirmed" || justConfirmed;
  return (
    <div
      ref={setNodeRef}
      style={{
        borderRadius: 10, overflow: "hidden",
        border: confirmed ? `1px solid ${crew.color}` : "1px dashed #94a3b8",
        background: confirmed ? `${crew.color}14` : "#f8fafc",
        boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
        opacity: isDragging ? 0.5 : 1, transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
      }}
    >
      <div {...listeners} {...attributes} style={{ padding: "8px 10px", cursor: "grab", touchAction: "none", borderLeft: `3px solid ${confirmed ? crew.color : "#cbd5e1"}`, display: "flex", gap: 6, alignItems: "flex-start" }}>
        <GripVertical size={13} style={{ color: confirmed ? crew.color : "#cbd5e1", flexShrink: 0, marginTop: 2, opacity: 0.8 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: confirmed ? crew.color : "#64748b" }}>
            {new Date(appt.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}
          </div>
          <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {appt.callerName ?? "Booking"}
          </div>
          {appt.serviceType && (
            <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 2, lineHeight: 1.2, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {appt.serviceType}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
        <details style={{ position: "relative", padding: "5px 7px", fontSize: 11 }}>
          <summary style={{ cursor: "pointer", color: "var(--accent)", fontWeight: 700 }}>Details</summary>
          <div style={{ position: "absolute", zIndex: 12, marginTop: 6, width: 280, maxWidth: "calc(100vw - 32px)", padding: 10, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 8px 24px rgba(15,23,42,.14)" }}><BookingDetails booking={appt} inspectorName={crew.name} timeZone={tz} compact /></div>
        </details>
        {!confirmed ? (
          <button onClick={() => onConfirm(appt)} disabled={busy} title="Confirms the booking and notifies the customer when a channel is available" style={{ flex: 1, fontSize: 12, fontWeight: 700, padding: "7px 4px", border: "none", background: "#16a34a", color: "#fff", cursor: "pointer" }}>
            {busy ? "Sending…" : smsEnabled && appt.callerPhone && appt.textOk !== false ? "✓ Confirm & text" : appt.callerEmail ? "✓ Confirm & email" : "✓ Confirm"}
          </button>
        ) : (
          <Link href={`/company/pipeline${previewSuffix ? previewSuffix + "&" : "?"}tab=appointments&appt=${appt.appointmentId}`} style={{ flex: 1, fontSize: 11, fontWeight: 700, padding: "6px", textAlign: "center", color: crew.color, textDecoration: "none" }}>
            Open →
          </Link>
        )}
        <button onClick={() => onUnassign(appt.appointmentId)} aria-label="Move back to unassigned" title="Move back to Unassigned (does not cancel the booking)" style={{ fontSize: 12, padding: "5px 9px", border: "none", borderLeft: "1px solid rgba(0,0,0,0.06)", background: "transparent", color: "#94a3b8", cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
          <Undo2 size={14} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

// ── Scheduled tile (in a crew×day cell) — grey until confirmed, then crew color ──
function ScheduledTile({
  job, crew, tz, onConfirm, onChangeTime, onUnschedule, busy, previewSuffix,
}: {
  job: Job;
  crew: Crew;
  tz: string;
  onConfirm: (j: Job) => void;
  onChangeTime?: (j: Job) => void;
  onUnschedule: (jobId: string) => void;
  busy: boolean;
  previewSuffix: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: job.jobId });
  const confirmed = !!job.crewConfirmed;
  const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  return (
    <div
      ref={setNodeRef}
      style={{
        borderRadius: 10, overflow: "hidden",
        border: confirmed ? `1px solid ${crew.color}` : "1px dashed #94a3b8",
        background: confirmed ? `${crew.color}14` : "#f8fafc",
        boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
        opacity: isDragging ? 0.5 : 1, transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
      }}
    >
      <div {...listeners} {...attributes} style={{ padding: "8px 10px", cursor: "grab", touchAction: "none", borderLeft: `3px solid ${confirmed ? crew.color : "#cbd5e1"}`, display: "flex", gap: 6, alignItems: "flex-start" }}>
        <GripVertical size={13} style={{ color: confirmed ? crew.color : "#cbd5e1", flexShrink: 0, marginTop: 2, opacity: 0.8 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          {job.scheduledStart && (
            <div style={{ fontSize: 12, fontWeight: 700, color: confirmed ? crew.color : "#64748b" }}>
              {fmtTime(job.scheduledStart)}
              {job.scheduledEnd && job.scheduledEnd !== job.scheduledStart ? `–${fmtTime(job.scheduledEnd)}` : ""}
            </div>
          )}
          <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{job.title}</div>
          <div style={{ fontSize: 10.5, fontWeight: 600, fontFamily: "monospace", color: "#94a3b8", marginTop: 2 }}>{job.jobId}</div>
        </div>
      </div>
      <div style={{ display: "flex", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
        {!confirmed ? (
          <button onClick={() => onConfirm(job)} disabled={busy} title="Emails the crew's address and every crew member who has one, and locks the time" style={{ flex: 1, fontSize: 12, fontWeight: 700, padding: "7px 4px", border: "none", background: "#16a34a", color: "#fff", cursor: "pointer" }}>{busy ? "Sending…" : "✓ Confirm + email crew"}</button>
        ) : (
          <Link href={`/company/jobs/${job.jobId}${previewSuffix}`} style={{ flex: 1, fontSize: 11, fontWeight: 700, padding: "6px", textAlign: "center", color: crew.color, textDecoration: "none" }}>Open →</Link>
        )}
        {/* Outside the drag handle on purpose: a button nested in the draggable (role="button") is invalid and eats taps. */}
        {!confirmed && onChangeTime && (
          <button onClick={() => onChangeTime(job)} aria-label="Change time" title="Change time" style={{ fontSize: 12, padding: "5px 9px", border: "none", borderLeft: "1px solid rgba(0,0,0,0.06)", background: "transparent", color: "#64748b", cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
            <Clock3 size={14} strokeWidth={1.75} />
          </button>
        )}
        <button onClick={() => { if (!confirmed || confirm("Unschedule this confirmed job? The crew was already emailed.")) onUnschedule(job.jobId); }} aria-label="Move back to unscheduled" title="Move back to Unscheduled (does not delete the job)" style={{ fontSize: 12, padding: "5px 9px", border: "none", borderLeft: "1px solid rgba(0,0,0,0.06)", background: "transparent", color: "#94a3b8", cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
          <Undo2 size={14} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
