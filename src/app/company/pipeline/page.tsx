"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessTimezone } from "@/hooks/useBusinessTimezone";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useNewRowIds } from "@/hooks/useNewRowIds";
import { getVerticalTemplate } from "@/lib/verticals/templates";
import { StatusChip } from "@/components/ui/StatusChip";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PageError } from "@/components/ui/PageError";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { useBootstrap } from "@/contexts/BootstrapContext";
import { RequestReviewDialog } from "@/components/requests/RequestReviewDialog";
import { BookingDetails } from "@/components/appointments/BookingDetails";
import type { RequestDeclineReason } from "@/lib/comms/requestDeclineEmail";
import { isNewRequest } from "@/lib/pipeline/requestReview";
import { displayRequestState } from "@/lib/requests/displayState";
import { fmtPhone } from "@/lib/format";
import { contactPhone } from "@/lib/format/phone";
import { confirmButtonLabel, confirmChannels, notifiedPhrase, type ConfirmChannel } from "@/lib/comms/confirmChannels";
import { CalendarDays, Check, Clock, FilePlus, History, ListTodo, Phone, UserRound, Workflow } from "lucide-react";

type Tab = "leads" | "appointments";

interface Lead {
  leadId: string;
  callerName?: string;
  callerPhone?: string;
  callerEmail?: string;
  serviceRequested?: string;
  address?: string;
  urgency: string;
  notes?: string;
  intake?: Record<string, string>;
  status: string;
  sourceCallId?: string;
  /** The AI escalated this call as an emergency (the lead is what puts it here). */
  escalated?: boolean;
  /** A different number the caller said to reach them on (callerPhone is caller ID). */
  callbackPhone?: string;
  /** Set once a job has been created from this lead. */
  jobId?: string;
  createdAt: number;
}

/** Chips carry only what needs attention: Escalated / Urgent. "Normal" said nothing and read like a second status. */
function AttentionChip({ lead }: { lead: Pick<Lead, "escalated" | "urgency"> }) {
  if (lead.escalated) return <span className="tag urgent" title="The AI escalated this call as an emergency">Escalated</span>;
  if (lead.urgency?.toLowerCase() === "urgent") return <StatusChip status="urgent" />;
  return null;
}

/**
 * The job this lead already became — its own, or the one made from the same call's booking. One call can leave a
 * lead (an escalation) AND a booking (2026-09-28, Carla): a job created from the booking must show on the lead too,
 * or the lead keeps offering "Create Job" and a second job gets made.
 */
function linkedJobId(lead: Lead, appointments: ReadonlyArray<{ sourceCallId?: string; jobId?: string }>): string | undefined {
  if (lead.jobId) return lead.jobId;
  if (!lead.sourceCallId) return undefined;
  return appointments.find((appt) => appt.sourceCallId === lead.sourceCallId && appt.jobId)?.jobId;
}

interface Appointment {
  appointmentId: string;
  callerName?: string;
  callerPhone?: string;
  callerEmail?: string;
  serviceType?: string;
  address?: string;
  notes?: string;
  intake?: Record<string, string>;
  startTime: number;
  endTime: number;
  status: string;
  pendingConfirmation?: boolean;
  bookedAfterHours?: boolean;
  textOk?: boolean;
  assignedCrewId?: string;
  assignedBy?: "ai" | "office";
  callSummary?: string;
  createdAt: number;
  sourceCallId?: string;
  /** Set once a job has been created from this booking — the card then opens it instead of offering "Create Job". */
  jobId?: string;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatApptDate(ms: number, tz: string): { day: string; date: string; time: string } {
  const d = new Date(ms);
  return {
    day: d.toLocaleDateString("en-US", { weekday: "long", timeZone: tz }),
    date: d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: tz }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }),
  };
}

function formatCallTime(ms: number, tz: string): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: tz,
  });
}

// T-100: structured intake rendered as labeled rows. Labels come from the
// vertical template (see intakeLabelFor) so each industry sees its own words.
function IntakeRows({ intake, labelFor }: { intake?: Record<string, string>; labelFor: (key: string) => string }) {
  if (!intake) return null;
  const entries = Object.entries(intake);
  if (entries.length === 0) return null;
  return (
    <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
      {entries.map(([key, value]) => (
        <div key={key} style={{ display: "flex", gap: 8, fontSize: 13, lineHeight: 1.4 }}>
          <span style={{ color: "#64748b", minWidth: 130, flexShrink: 0 }}>{labelFor(key)}</span>
          <span style={{ color: "#0f172a", fontWeight: 600 }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

/** Long lists are bounded (C10): each section shows this many, then "Show more". */
const PIPELINE_PAGE = 10;

export default function PipelinePage() {
  const businessId = useBusinessId();
  const { user } = useAuth();
  const tz = useBusinessTimezone();
  const { vocab, isEnabled, ready: modulesReady, industry } = useBusinessModules();
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");
  const previewSuffix = preview ? `?preview=${preview}` : "";

  // T-100: intake labels come from the vertical template so a dental office
  // sees "Insurance" and property management sees "Unit number" — never a raw
  // camelCase key. Unknown industry fails open to the key itself.
  const intakeFields = industry ? getVerticalTemplate(industry).intakeFields : [];
  const intakeLabelFor = (key: string): string =>
    intakeFields.find((field) => field.key === key)?.label ?? key;

  // A lead/appointment can only become a Job where the "jobs" module exists
  // (every appointments-mode industry — dental, childcare, care homes, … —
  // disables it). Gate on `ready` exactly like company/layout.tsx's module
  // routes so the button can't flash in before bootstrap resolves, and never
  // dangle a dead button for a tenant whose Jobs page is route-blocked.
  const showJobActions = modulesReady && isEnabled("jobs");

  const urgencyParam = searchParams?.get("urgency");
  const leadParam = searchParams?.get("lead");
  const apptParam = searchParams?.get("appt");
  // Booked inspections are the pipeline's primary workflow. Keep the old
  // ?tab=appointments / ?tab=leads deep links, but default a bare visit to Booked.
  const initialTab: Tab = searchParams?.get("tab") === "leads" ? "leads" : "appointments";
  const [tab, setTab] = useState<Tab>(initialTab);

  // Leads state
  const [leads, setLeads] = useState<Lead[]>([]);
  const leadRows = useNewRowIds<Lead>((lead) => lead.leadId);
  const initialLoadDone = useRef(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadFilter, setLeadFilter] = useState<"all" | "urgent" | "new" | "contacted">(urgencyParam === "urgent" ? "urgent" : "all");
  const [leadCalling, setLeadCalling] = useState<string | null>(null);
  const [leadUpdating, setLeadUpdating] = useState(false);
  const [reviewLead, setReviewLead] = useState<Lead | null>(null);

  // Appointments state
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [upcomingShown, setUpcomingShown] = useState(PIPELINE_PAGE);
  const [pastShown, setPastShown] = useState(PIPELINE_PAGE);
  const [leadsShown, setLeadsShown] = useState(PIPELINE_PAGE);
  const appointmentRows = useNewRowIds<Appointment>((appointment) => appointment.appointmentId);
  const [apptUpdating, setApptUpdating] = useState<string | null>(null);
  const confirmingIds = useRef(new Set<string>());
  const [confirmErrors, setConfirmErrors] = useState<Record<string, string>>({});
  const [confirmedSet, setConfirmedSet] = useState<Set<string>>(new Set());
  const bootstrapBusiness = useBootstrap().data?.business;
  const phoneLine = bootstrapBusiness?.phoneLine ?? null;
  const smsEnabled = bootstrapBusiness?.smsEnabled === true;
  const [apptCalling, setApptCalling] = useState<string | null>(null);
  const [reviewAppt, setReviewAppt] = useState<Appointment | null>(null);
  const [crewNames, setCrewNames] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: "error" | "warn" | "ok" } | null>(null);

  function showToast(msg: string, tone: "error" | "warn" | "ok" = "error") {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 4500);
  }

  // What the last load left on screen — background refreshes merge into it (see loadPipeline).
  const leadsRef = useRef<Lead[]>([]);
  const apptsRef = useRef<Appointment[]>([]);
  // Synced from state (not just from loads) so a local edit — a status change, a cancel — is what the next merge keeps.
  useEffect(() => { leadsRef.current = leads; }, [leads]);
  useEffect(() => { apptsRef.current = appointments; }, [appointments]);
  const loadPipeline = useCallback(async () => {
    if (!businessId) return;
    // T-071: server-side admin-SDK reads instead of direct client Firestore
    // queries — see the leads route for the full round-trip-time rationale.
    const base = `/api/businesses/${businessId}`;
    // Returned so useLiveRefresh's "never overlap requests" guard actually waits for it.
    const now = Date.now();
    // The first load reads everything the page shows. A background refresh (every few seconds while the page is open)
    // reads only what can have changed — the newest callbacks, the next two weeks, and requests awaiting a decision —
    // and merges it into what is on screen. Re-reading every booking each tick cost hundreds of Firestore reads per
    // refresh against the free plan's 50k/day.
    const firstLoad = !initialLoadDone.current;
    const requests = firstLoad
      ? [
        fetch(`${base}/leads`),
        fetch(`${base}/appointments?from=${now}&to=8640000000000000`),
        fetch(`${base}/appointments?order=desc&limit=500`),
        fetch(`${base}/appointments?pending=1`),
        fetch(`/api/company/crews?businessId=${businessId}`),
      ]
      : [
        fetch(`${base}/leads?limit=30`),
        fetch(`${base}/appointments?from=${now - 86_400_000}&to=${now + 14 * 86_400_000}`),
        fetch(`${base}/appointments?pending=1`),
      ];
    return Promise.all(requests)
      .then(async (responses) => {
        if (responses.some((res) => !res.ok)) throw new Error("Pipeline data request failed");
        const pages = await Promise.all(responses.map((res) => res.json())) as Array<{ leads?: Lead[]; appointments?: Appointment[]; crews?: Array<{ crewId: string; name: string }> }>;
        const [leadsPage, ...rest] = pages;
        const appointmentPages = firstLoad ? rest.slice(0, 3) : rest;
        if (firstLoad) setCrewNames(Object.fromEntries((rest[3]?.crews ?? []).map((crew) => [crew.crewId, crew.name])));
        const freshLeads = leadsPage.leads ?? [];
        const freshAppts = appointmentPages.flatMap((page) => page.appointments ?? []);
        // Merge by id: a background page updates the rows it carries and adds new ones; older rows stay as loaded.
        const leadsData = firstLoad ? freshLeads : [...new Map([...leadsRef.current, ...freshLeads].map((lead) => [lead.leadId, lead])).values()]
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        const apptsData = [...new Map([...(firstLoad ? [] : apptsRef.current), ...freshAppts].map((appt) => [appt.appointmentId, appt])).values()];
        setLeads(leadsData);
        leadRows.track(leadsData);
        // The ?lead= deep link and "first lead" default apply ONLY to the first load. A background refresh must keep
        // whichever lead the user is looking at (matched by id, so its data still updates).
        const chosenLead = leadParam ? leadsData.find((l) => l.leadId === leadParam) : undefined;
        setSelectedLead((prev) => {
          if (firstLoad) return chosenLead ?? leadsData[0] ?? null;
          return (prev && leadsData.find((l) => l.leadId === prev.leadId)) || leadsData[0] || null;
        });
        setAppointments(apptsData);
        appointmentRows.track(apptsData);
        initialLoadDone.current = true;
      })
      // A failed BACKGROUND refresh keeps the data already on screen; only a failed first load shows the error state.
      .catch(() => { if (!initialLoadDone.current) setLoadError(true); })
      .finally(() => setLoading(false));
  }, [businessId, leadParam]);
  useEffect(() => { void loadPipeline(); }, [loadPipeline]);
  useLiveRefresh(loadPipeline, { intervalMs: 10_000, enabled: Boolean(businessId) });

  // Deep link from Calendar's "Bookings" strip (?tab=appointments&appt=<id>) —
  // scroll straight to the clicked appointment instead of leaving the user to
  // hunt for it by name, which is what made an unrelated same-named past/
  // cancelled appointment look like the wrong page had loaded.
  // ONCE per link: `appointments` changes on every 10-second refresh and every Confirm, and re-running this on each change
  // yanked the page back down to the linked card (2026-09-28: "the screen randomly scrolls to the bottom").
  const scrolledToAppt = useRef<string | null>(null);
  // The linked card is outlined for a few seconds, not for as long as the link stays in the address bar.
  const [flashAppt, setFlashAppt] = useState<string | null>(null);
  useEffect(() => {
    if (!apptParam || tab !== "appointments" || loading || scrolledToAppt.current === apptParam) return;
    const el = document.getElementById(`appt-${apptParam}`);
    if (!el) return;
    scrolledToAppt.current = apptParam;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashAppt(apptParam);
  }, [apptParam, tab, loading, appointments]);
  useEffect(() => {
    if (!flashAppt) return;
    const timer = setTimeout(() => setFlashAppt(null), 4000);
    return () => clearTimeout(timer);
  }, [flashAppt]);

  // T-084: the matching lead deep link from Calls (?tab=leads&lead=<id>) —
  // same anchor pattern (and the same once-only rule), scrolls the queue card a call produced into view.
  const scrolledToLead = useRef<string | null>(null);
  useEffect(() => {
    if (!leadParam || tab !== "leads" || loading || scrolledToLead.current === leadParam) return;
    const el = document.getElementById(`lead-${leadParam}`);
    if (!el) return;
    scrolledToLead.current = leadParam;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [leadParam, tab, loading, leads]);

  // --- Lead actions ---
  async function callBackLead(lead: Lead) {
    const phone = contactPhone(lead);
    if (!phone) return;
    setLeadCalling(lead.leadId);
    try {
      const res = await fetch("/api/calls/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, targetPhone: phone, leadId: lead.leadId }),
      });
      if (res.ok) {
        showToast(`The AI is calling ${lead.callerName || "them"} now.`, "ok");
      } else {
        const data = await res.json().catch(() => ({} as { error?: string }));
        showToast(`The callback could not be started${data.error ? `: ${data.error}` : ". Try again."}`);
      }
    } catch {
      showToast("Network error — could not initiate call.");
    } finally {
      setLeadCalling(null);
    }
  }

  async function markContacted(lead: Lead) {
    setLeadUpdating(true);
    try {
      const res = await fetch(`/api/businesses/${businessId}/leads/${lead.leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, status: "contacted" }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => ""));
      setLeads((prev) => prev.map((l) => (l.leadId === lead.leadId ? { ...l, status: "contacted" } : l)));
      if (selectedLead?.leadId === lead.leadId) setSelectedLead({ ...lead, status: "contacted" });
      showToast("Marked as contacted.", "ok");
    } catch {
      showToast("Couldn't update the lead. Try again.");
    } finally {
      setLeadUpdating(false);
    }
  }

  async function decideLead(lead: Lead, status: "booked" | "lost", reason?: RequestDeclineReason, customMessage?: string, notifyChannel?: "sms" | "email" | "none") {
    const res = await fetch(`/api/businesses/${businessId}/leads/${lead.leadId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, status, ...(notifyChannel ? { notifyChannel } : {}), ...(reason ? { declineReason: reason, customMessage } : {}) }) });
    if (!res.ok) throw new Error("Request decision failed");
    const data = await res.json() as { noEmail?: boolean; notifiedCustomer?: boolean };
    setLeads((previous) => previous.map((item) => item.leadId === lead.leadId ? { ...item, status } : item));
    setSelectedLead((current) => current?.leadId === lead.leadId ? { ...current, status } : current);
    if (status === "lost") showToast(data.noEmail ? "Request declined. No email on file — nothing was sent." : data.notifiedCustomer ? "Request declined and customer notified." : "Request declined. Customer notification could not be sent.", data.noEmail ? "warn" : "ok");
  }

  // --- Appointment actions ---
  async function updateApptStatus(appt: Appointment, status: string) {
    setApptUpdating(appt.appointmentId);
    try {
      const res = await fetch(`/api/businesses/${businessId}/appointments/${appt.appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, status }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => ""));
      setAppointments((prev) =>
        prev.map((a) => (a.appointmentId === appt.appointmentId ? { ...a, status } : a))
      );
    } catch {
      showToast("The appointment could not be updated. Try again.");
    } finally {
      setApptUpdating(null);
    }
  }

  async function createJobFromRequest(request: { appointmentId?: string; leadId?: string }) {
    const res = await fetch("/api/jobs/from-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, ...request }) });
    if (!res.ok) throw new Error("Job creation failed");
    const { job, created } = await res.json() as { job: { jobId: string }; created?: boolean };
    // One request makes one job. Opening the existing one without a word read as "it opened a random old job".
    if (created === false && !window.confirm(`This request already has ${vocab.jobNoun.toLowerCase()} ${job.jobId}. Open it?`)) return;
    window.location.href = `/company/jobs/${job.jobId}${previewSuffix}`;
  }

  /** "confirm" = the office has confirmed and the AI tells the customer; "callback" = the AI follows up on the request. */
  async function callBackAppt(appt: Appointment, purpose: "confirm" | "callback" = "callback") {
    if (!appt.callerPhone) return;
    setApptCalling(appt.appointmentId);
    try {
      const res = await fetch("/api/calls/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, targetPhone: appt.callerPhone, appointmentId: appt.appointmentId, purpose }),
      });
      if (res.ok) {
        showToast(`The AI is calling ${appt.callerName || "the customer"} now${purpose === "confirm" ? " to confirm" : ""}.`, "ok");
      } else {
        const data = await res.json().catch(() => ({} as { error?: string }));
        showToast(`The call could not be started${data.error ? `: ${data.error}` : ". Try again."}`);
      }
    } catch {
      showToast("Network error — could not initiate call.");
    } finally {
      setApptCalling(null);
    }
  }

  // Every channel the caller gave on the call — email, text, or both (src/lib/comms/confirmChannels.ts).
  function channelsFor(appt: Appointment): ConfirmChannel[] {
    return confirmChannels({ smsEnabled, phone: contactPhone(appt), textOk: appt.textOk, email: appt.callerEmail });
  }

  async function sendConfirmation(appt: Appointment): Promise<boolean> {
    if (confirmingIds.current.has(appt.appointmentId)) return false;
    confirmingIds.current.add(appt.appointmentId);
    setConfirmErrors((previous) => ({ ...previous, [appt.appointmentId]: "" }));
    setApptUpdating(appt.appointmentId + "_confirm");
    try {
      const res = await fetch(`/api/appointments/${appt.appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, confirm: true, notifyCustomer: true, notifyChannel: "auto" }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({} as { notifiedChannels?: ConfirmChannel[]; staffNotified?: number }));
        setConfirmedSet((prev) => new Set(prev).add(appt.appointmentId));
        setAppointments((prev) =>
          prev.map((a) => (a.appointmentId === appt.appointmentId ? { ...a, status: "confirmed" } : a))
        );
        const told = notifiedPhrase(data.notifiedChannels);
        const customer = told ? `customer ${told}` : "no email or OK-to-text from the call — phone them";
        const staff = data.staffNotified ? ` · ${data.staffNotified} inspector${data.staffNotified === 1 ? "" : "s"} notified` : "";
        showToast(`Confirmed · ${customer}${staff}`, told || data.staffNotified ? "ok" : "warn");
        setTimeout(() => {
          setConfirmedSet((prev) => {
            const next = new Set(prev);
            next.delete(appt.appointmentId);
            return next;
          });
        }, 3000);
        return true;
      }
      showToast("Couldn't confirm the appointment. Try again.");
      setConfirmErrors((previous) => ({ ...previous, [appt.appointmentId]: "Couldn't confirm the booking. Retry." }));
      return false;
    } catch {
      showToast("Network error — couldn't confirm the appointment.");
      setConfirmErrors((previous) => ({ ...previous, [appt.appointmentId]: "Network error. Retry confirmation." }));
      return false;
    } finally {
      confirmingIds.current.delete(appt.appointmentId);
      setApptUpdating(null);
    }
  }

  async function declineAppointment(appt: Appointment, reason: RequestDeclineReason, customMessage?: string) {
    const res = await fetch(`/api/appointments/${appt.appointmentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, declineReason: reason, customMessage }) });
    if (!res.ok) throw new Error("Request decision failed");
    const data = await res.json() as { noEmail?: boolean; notifiedCustomer?: boolean };
    setAppointments((previous) => previous.map((item) => item.appointmentId === appt.appointmentId ? { ...item, status: "cancelled", pendingConfirmation: false } : item));
    showToast(data.noEmail ? "Request declined. No email on file — nothing was sent." : data.notifiedCustomer ? "Request declined and customer notified." : "Request declined. Customer notification could not be sent.", data.noEmail ? "warn" : "ok");
  }

  const filteredLeads = leads.filter((l) => {
    if (leadFilter === "urgent") return l.urgency === "urgent" || l.urgency === "Urgent";
    if (leadFilter === "new") return l.status === "new";
    if (leadFilter === "contacted") return l.status === "contacted";
    return true;
  });

  const newLeadsCount = leads.filter((l) => l.status === "new").length;
  // Needs Confirmation is pulled out ahead of the time-based split: a
  // pending after-hours booking can't lose its Confirm button just because
  // its slot time has already passed (that used to bury it, unconfirmable,
  // under "Past & Cancelled" — see the Calendar deep-link fix above).
  // Requests whose time already passed go LAST: on 2026-09-27 a two-day-old test booking ("Kareem, Sat 8 AM") sat
  // above the owner's new one ("Kareem, Mon 2 PM") and got confirmed by mistake, which read as "my 2 PM became 8 AM".
  const nowMs = Date.now();
  const needsConfirmation = appointments.filter(
    (a) => a.pendingConfirmation && a.status !== "confirmed" && a.status !== "cancelled"
  ).sort((a, b) => Number(a.startTime <= nowMs) - Number(b.startTime <= nowMs) || a.startTime - b.startTime);
  const needsConfirmationIds = new Set(needsConfirmation.map((a) => a.appointmentId));
  const upcomingAppts = appointments.filter(
    (a) => !needsConfirmationIds.has(a.appointmentId) && a.startTime > Date.now() && a.status !== "cancelled"
  ).sort((a, b) => a.startTime - b.startTime);
  const pastAppts = appointments.filter(
    (a) => !needsConfirmationIds.has(a.appointmentId) && (a.startTime <= Date.now() || a.status === "cancelled")
  ).sort((a, b) => b.startTime - a.startTime);
  const pendingCount = needsConfirmation.length;

  if (loading) return <PageSkeleton rows={6} />;
  if (loadError) {
    return (
      <PageError
        message="Leads and appointments could not be loaded. No pipeline data is being shown."
        onRetry={() => window.location.reload()}
      />
    );
  }

  function AppointmentCard({ appt, isPast }: { appt: Appointment; isPast?: boolean }) {
    const { day, date, time } = formatApptDate(appt.startTime, tz);
    const busy = apptUpdating === appt.appointmentId || apptUpdating === appt.appointmentId + "_confirm";
    const justConfirmed = confirmedSet.has(appt.appointmentId);
    const isConfirmed = appt.status === "confirmed" || justConfirmed;
    const isPending = !!appt.pendingConfirmation && !isConfirmed && appt.status !== "cancelled";
    const isTarget = flashAppt === appt.appointmentId;
    const timePassed = appt.startTime <= Date.now();
    // No email but a phone: the confirmation goes out as an AI phone call instead.
    const confirmByCall = isPending && !appt.callerEmail && !!appt.callerPhone;

    return (
      <article
        id={`appt-${appt.appointmentId}`}
        className={`appt-card${appointmentRows.newIds.has(appt.appointmentId) ? " row-new" : ""}`}
        style={{
          opacity: isPast ? 0.75 : 1,
          ...(isPending ? { borderLeft: "4px solid #f59e0b", background: "#fffdf7" } : {}),
          ...(isTarget ? { boxShadow: "0 0 0 3px var(--accent)" } : {}),
        }}
      >
        <div className="appt-date-block">
          <span className="appt-day">Appt. {day}</span>
          <span className="appt-date">{date}</span>
          <span className="appt-time">{time}</span>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
            <span className="appt-booked-at" style={{ display: "block", marginBottom: 2, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}>Call received</span>
            <span className="appt-booked-at">{formatCallTime(appt.createdAt, tz)}</span>
          </div>
        </div>

        <div className="appt-body">
          <div className="appt-name-row">
            <span className="appt-name">{appt.callerName ?? "Unknown caller"}</span>
            {isPending
              ? <StatusChip status="requested" label={displayRequestState(appt).label + " · " + displayRequestState(appt).nextAction} />
              : <StatusChip status={appt.status} label={displayRequestState(appt).label} />}
          </div>
          {isPending && (
            <div style={{ margin: "8px 0", padding: "8px 12px", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, fontSize: 12, color: "#92400e", lineHeight: 1.45, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <Clock size={13} style={{ marginTop: 1, flexShrink: 0 }} />
              {timePassed
                ? "This requested time has already passed. Call the customer to agree a new time, or decline it."
                : appt.bookedAfterHours === true
                  ? "Booked after hours. Confirm to notify the customer and lock it in."
                  : "New booking from your AI receptionist. Confirm to notify the customer and lock it in."}
            </div>
          )}
          <p className="appt-detail">{appt.serviceType ?? "Service not specified"}</p>
          <p className="c1-phone-only appt-detail">{appt.callerPhone ?? "No phone"} · {appt.address ?? "No address"}</p>
          <div className="c1-desktop-only"><BookingDetails booking={appt} inspectorName={appt.assignedCrewId ? crewNames[appt.assignedCrewId] : undefined} timeZone={tz} compact showName={false} /></div>
          {!appt.callerEmail && isPending && <p className="appt-detail" style={{ color: "#b45309" }}>{confirmByCall ? "No email on file — call them yourself" : "No email on file — notify the customer manually"}</p>}
          <div className="c1-desktop-only"><IntakeRows intake={appt.intake} labelFor={intakeLabelFor} /></div>
        </div>

        <div className="appt-actions">
          {isNewRequest(appt.status) && <span className="tag">New request</span>}
          {appt.jobId && showJobActions ? (
            <Link className="button primary" href={`/company/jobs/${appt.jobId}${previewSuffix}`}>Open {vocab.jobNoun} {appt.jobId}</Link>
          ) : !isPast && appt.status !== "cancelled" && isPending && !timePassed ? (
            <button className="button primary" disabled={busy || apptCalling === appt.appointmentId} onClick={() => void sendConfirmation(appt)}>
              {busy ? "Confirming…" : confirmErrors[appt.appointmentId] ? "Retry confirmation" : confirmButtonLabel(channelsFor(appt))}
            </button>
          ) : !isPast && appt.status !== "cancelled" && !isConfirmed ? (
            <button className="button primary" type="button" onClick={() => setReviewAppt(appt)}>Review request</button>
          ) : showJobActions && isConfirmed && !appt.jobId ? (
            <button className="button primary" disabled={busy} onClick={() => void createJobFromRequest({ appointmentId: appt.appointmentId })}>Create {vocab.jobNoun}</button>
          ) : null}
          {confirmErrors[appt.appointmentId] && <p role="alert" className="c1-inline-error">{confirmErrors[appt.appointmentId]}</p>}
          <details className="c1-more-menu">
            <summary className="button secondary">More</summary>
            <div className="c1-more-actions">
              {/* T-182: on a phone the booking details live here too — one disclosure per card, not "Details" + "More". */}
              <div className="c1-phone-only" style={{ display: "grid", gap: 6, paddingBottom: 8, borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
                <BookingDetails booking={appt} inspectorName={appt.assignedCrewId ? crewNames[appt.assignedCrewId] : undefined} timeZone={tz} compact showName={false} />
                <IntakeRows intake={appt.intake} labelFor={intakeLabelFor} />
              </div>
              {appt.callerPhone && <button className="button secondary" disabled={apptCalling === appt.appointmentId} onClick={() => callBackAppt(appt)}>{apptCalling === appt.appointmentId ? "Calling…" : "Call back"}</button>}
              {!isPast && appt.status !== "cancelled" && <button className="button secondary" type="button" onClick={() => setReviewAppt(appt)}>Review details</button>}
              {!isPast && !isConfirmed && !justConfirmed && <button className="button ghost" disabled={busy} onClick={() => updateApptStatus(appt, "confirmed")}>Confirm without email</button>}
              {!isPast && appt.status !== "cancelled" && !appt.jobId && <button className="button danger" disabled={busy} onClick={() => { if (confirm("Cancel this appointment?")) updateApptStatus(appt, "cancelled"); }}>Cancel</button>}
            </div>
          </details>
        </div>
      </article>
    );
  }

  // Never had a request: one clear "what goes here" panel replaces two empty tabs.
  const pipelineEmpty = leads.length === 0 && appointments.length === 0;

  return (
    <>
      {toast && (
        <div role="alert" style={{
          position: "fixed", top: 72, right: 24, zIndex: 50,
          background: toast.tone === "ok" ? "#f0fdf4" : toast.tone === "warn" ? "#fffbeb" : "#fef2f2",
          border: `1px solid ${toast.tone === "ok" ? "#86efac" : toast.tone === "warn" ? "#fcd34d" : "#fca5a5"}`,
          color: toast.tone === "ok" ? "#15803d" : toast.tone === "warn" ? "#92400e" : "#b91c1c",
          padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, boxShadow: "0 6px 18px rgba(0,0,0,0.10)", maxWidth: 380,
        }}>
          {toast.msg}
        </div>
      )}
      <header className="page-header">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Workflow size={20} strokeWidth={1.75} />
            Pipeline
          </h1>
          <p className="page-subtitle">Booked customers first. Call back anyone who did not book.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {pendingCount > 0 && (
            <span className="status-pill" style={{ background: "#fffbeb", color: "#92400e", borderColor: "#fcd34d" }}>
              {pendingCount} to confirm
            </span>
          )}
          {newLeadsCount > 0 && (
            <span className="status-pill status-pill--neutral">{newLeadsCount} new callbacks</span>
          )}
        </div>
      </header>

      {!pipelineEmpty && <div className="toolbar" style={{ marginBottom: 20 }}>
        <div className="segmented-control" aria-label="Pipeline view">
          <button
            className="segment"
            type="button"
            aria-pressed={tab === "appointments"}
            onClick={() => setTab("appointments")}
          >
            Booked{appointments.length > 0 ? ` (${appointments.length})` : ""}
          </button>
          <button
            className="segment"
            type="button"
            aria-pressed={tab === "leads"}
            onClick={() => setTab("leads")}
          >
            Callbacks{leads.length > 0 ? ` (${leads.length})` : ""}
          </button>
        </div>
      </div>}

      {!pipelineEmpty && tab === "leads" && (
        <>
          <p className="page-subtitle" style={{ marginBottom: 12 }}>Callers who didn&apos;t book — call them back.</p>
          <div className="toolbar" style={{ marginBottom: 16 }}>
            <div className="segmented-control" aria-label="Lead status filter">
              {(["all", "urgent", "new", "contacted"] as const).map((f) => (
                <button
                  key={f}
                  className="segment"
                  type="button"
                  aria-pressed={leadFilter === f}
                  onClick={() => setLeadFilter(f)}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            {leadFilter !== "all" && <div className="c1-active-filter">Filter: {leadFilter} <button type="button" className="button small" onClick={() => setLeadFilter("all")}>Clear</button></div>}
          </div>

          <div className="lead-workspace">
            <section className="panel" aria-labelledby="lead-queue-title">
              <div className="panel-header">
                <h2 className="panel-title" id="lead-queue-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ListTodo size={16} strokeWidth={1.75} />
                  Follow-up Queue
                </h2>
              </div>
              <div className="panel-body">
                {filteredLeads.length === 0 ? (
                  <EmptyState
                    compact
                    title="Nothing here right now"
                    secondary={leads.length > 0 && leadFilter !== "all"
                      ? { label: "Show all", onClick: () => setLeadFilter("all") }
                      : appointments.length > 0 ? { label: "Show booked", onClick: () => setTab("appointments") } : undefined}
                  />
                ) : (
                  <div className="queue-list">
                    {filteredLeads.slice(0, leadsShown).map((lead) => (
                      <article
                        className={`lead-card${leadRows.newIds.has(lead.leadId) ? " row-new" : ""}`}
                        key={lead.leadId}
                        id={`lead-${lead.leadId}`}
                        aria-selected={selectedLead?.leadId === lead.leadId}
                        onClick={() => setSelectedLead(lead)}
                        style={{
                          cursor: "pointer",
                          ...(!!leadParam && leadParam === lead.leadId ? { boxShadow: "0 0 0 3px var(--accent)" } : {}),
                        }}
                      >
                        <div className="lead-title-row">
                          <div>
                            <p className="lead-name">{lead.callerName || "Unknown caller"}</p>
                            <p className="lead-phone">{contactPhone(lead) ? fmtPhone(contactPhone(lead)) : "—"}</p>
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <AttentionChip lead={lead} />
                            {linkedJobId(lead, appointments) && <span className="tag">{vocab.jobNoun} created</span>}
                            {isNewRequest(lead.status) ? <span className="tag">New request</span> : <StatusChip status={lead.status} />}
                          </div>
                        </div>
                        <div className="lead-detail-grid c1-desktop-only">
                          <div className="detail-block">
                            <span className="detail-label">Service</span>
                            <span className="detail-value">{lead.serviceRequested ?? "—"}</span>
                          </div>
                          <div className="detail-block">
                            <span className="detail-label">Address</span>
                            <span className="detail-value">{lead.address ?? "—"}</span>
                          </div>
                        </div>
                        {lead.notes && (
                          <p className="c1-desktop-only" style={{ margin: "4px 0 0", fontSize: 12, color: "#475569", fontStyle: "italic", lineHeight: 1.4 }}>
                            &ldquo;{lead.notes.length > 100 ? lead.notes.slice(0, 100) + "…" : lead.notes}&rdquo;
                          </p>
                        )}
                        <p className="queue-meta">Captured {timeAgo(lead.createdAt)}</p>
                        <details className="c1-phone-only" onClick={(event) => event.stopPropagation()}><summary>Details</summary><p>{lead.serviceRequested || "No service"} · {lead.address || "No address"}</p>{lead.notes && <p>{lead.notes}</p>}</details>
                        <div className="lead-actions" onClick={(e) => e.stopPropagation()}>
                          {linkedJobId(lead, appointments) && (
                            <Link className="button small" href={`/company/jobs/${linkedJobId(lead, appointments)}${previewSuffix}`}>
                              Open {vocab.jobNoun} {linkedJobId(lead, appointments)}
                            </Link>
                          )}
                          {contactPhone(lead) && (
                            <button
                              className="button small"
                              type="button"
                              disabled={leadCalling === lead.leadId}
                              onClick={() => callBackLead(lead)}
                              title={`Call ${fmtPhone(contactPhone(lead))}`}
                              style={{ display: "flex", alignItems: "center", gap: 6 }}
                            >
                              <Phone size={13} />
                              {leadCalling === lead.leadId ? "Calling…" : "Call Back"}
                            </button>
                          )}
                          {lead.status !== "contacted" && (
                            <button
                              className="button small secondary"
                              type="button"
                              disabled={leadUpdating}
                              onClick={() => markContacted(lead)}
                            >
                              Mark contacted
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                    {filteredLeads.length > leadsShown && (
                      <button type="button" className="button" onClick={() => setLeadsShown((n) => n + PIPELINE_PAGE)}>
                        Show {Math.min(PIPELINE_PAGE, filteredLeads.length - leadsShown)} more of {filteredLeads.length}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>

            <aside className="panel" aria-labelledby="selected-lead-title">
              <div className="panel-header">
                <h2 className="panel-title" id="selected-lead-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <UserRound size={16} strokeWidth={1.75} />
                  Lead Detail
                </h2>
              </div>
              <div className="panel-body">
                {!selectedLead ? (
                  <p style={{ color: "#888", fontSize: 14 }}>Select a lead to view details.</p>
                ) : (
                  <>
                    <div className="lead-title-row">
                      <div>
                        <p className="lead-name">{selectedLead.callerName || "Unknown caller"}</p>
                        <p className="lead-phone">{contactPhone(selectedLead) ? fmtPhone(contactPhone(selectedLead)) : "—"}</p>
                      </div>
                      <AttentionChip lead={selectedLead} />
                    </div>

                    <div className="lead-detail-grid" style={{ marginTop: 16 }}>
                      <div className="detail-block">
                        <span className="detail-label">Service</span>
                        <span className="detail-value">{selectedLead.serviceRequested ?? "—"}</span>
                      </div>
                      <div className="detail-block">
                        <span className="detail-label">Status</span>
                        <span className="detail-value"><StatusChip status={selectedLead.status} /></span>
                      </div>
                      <div className="detail-block">
                        <span className="detail-label">Address</span>
                        <span className="detail-value">{selectedLead.address ?? "—"}</span>
                      </div>
                      <div className="detail-block">
                        <span className="detail-label">Captured</span>
                        <span className="detail-value">{timeAgo(selectedLead.createdAt)}</span>
                      </div>
                    </div>

                    {selectedLead.notes && (
                      <p style={{ marginTop: 12, fontSize: 14, color: "#444" }}>{selectedLead.notes}</p>
                    )}

                    <IntakeRows intake={selectedLead.intake} labelFor={intakeLabelFor} />

                    {/* One primary action per lead: a new request is reviewed (Confirm & create job lives there); later
                        leads offer Create job directly. Everything else is secondary. */}
                    <div className="lead-actions" style={{ marginTop: 18 }}>
                      {isNewRequest(selectedLead.status) && (
                        <button className="button primary" type="button" onClick={() => setReviewLead(selectedLead)}>Review request</button>
                      )}
                      <button
                        className="button secondary"
                        type="button"
                        disabled={selectedLead.status === "contacted" || leadUpdating}
                        onClick={() => markContacted(selectedLead)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                      >
                        <Check size={14} strokeWidth={1.75} />
                        {selectedLead.status === "contacted" ? "Contacted" : "Mark contacted"}
                      </button>
                      {contactPhone(selectedLead) && (
                        <button
                          className="button"
                          type="button"
                          disabled={leadCalling === selectedLead.leadId}
                          onClick={() => callBackLead(selectedLead)}
                          title={`Call ${fmtPhone(contactPhone(selectedLead))}`}
                          style={{ display: "flex", alignItems: "center", gap: 6 }}
                        >
                          <Phone size={13} />
                          {leadCalling === selectedLead.leadId ? "Calling…" : "Call Back"}
                        </button>
                      )}
                      {linkedJobId(selectedLead, appointments) ? (
                        <Link
                          className={isNewRequest(selectedLead.status) ? "button" : "button primary"}
                          href={`/company/jobs/${linkedJobId(selectedLead, appointments)}${previewSuffix}`}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                        >
                          Open {vocab.jobNoun} {linkedJobId(selectedLead, appointments)}
                        </Link>
                      ) : showJobActions && !isNewRequest(selectedLead.status) && selectedLead.status !== "lost" && (
                        <button
                          className="button primary"
                          type="button"
                          onClick={() => void createJobFromRequest({ leadId: selectedLead.leadId })}
                          title={`Create a ${vocab.jobNoun.toLowerCase()} from this confirmed request`}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                        >
                          <FilePlus size={14} strokeWidth={1.75} />
                          Create {vocab.jobNoun}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </aside>
          </div>
        </>
      )}

      {!pipelineEmpty && tab === "appointments" && (
        <>
          {needsConfirmation.length > 0 && (
            <section className="panel" aria-labelledby="needs-confirmation-title" style={{ marginBottom: 20 }}>
              <div className="panel-header">
                <h2 className="panel-title" id="needs-confirmation-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Clock size={16} strokeWidth={1.75} />
                  Needs Confirmation
                </h2>
              </div>
              <div className="panel-body">
                <div style={{ display: "grid", gap: 16 }}>
                  {needsConfirmation.map((appt) => (
                    <AppointmentCard key={appt.appointmentId} appt={appt} isPast={false} />
                  ))}
                </div>
              </div>
            </section>
          )}

          <section className="panel" aria-labelledby="upcoming-title">
            <div className="panel-header">
              <h2 className="panel-title" id="upcoming-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <CalendarDays size={16} strokeWidth={1.75} />
                Upcoming Inspections
              </h2>
            </div>
            <div className="panel-body">
              {upcomingAppts.length === 0 ? (
                <EmptyState
                  compact
                  title="Nothing here right now"
                  secondary={leads.length > 0 ? { label: "Show callbacks", onClick: () => setTab("leads") } : undefined}
                />
              ) : (
                <div style={{ display: "grid", gap: 16 }}>
                  {upcomingAppts.slice(0, upcomingShown).map((appt) => (
                    <AppointmentCard key={appt.appointmentId} appt={appt} />
                  ))}
                  {upcomingAppts.length > upcomingShown && (
                    <button type="button" className="button" onClick={() => setUpcomingShown((n) => n + PIPELINE_PAGE)}>
                      Show {Math.min(PIPELINE_PAGE, upcomingAppts.length - upcomingShown)} more of {upcomingAppts.length}
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* T-182: history is folded away — it is looked up, not worked from. */}
          {pastAppts.length > 0 && (
            <details className="panel pipeline-past" style={{ marginTop: 20 }}>
              <summary className="panel-header" style={{ cursor: "pointer", listStyle: "none" }}>
                <h2 className="panel-title" id="past-title" style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
                  <History size={16} strokeWidth={1.75} />
                  Past and cancelled ({pastAppts.length})
                </h2>
              </summary>
              <div className="panel-body">
                <div style={{ display: "grid", gap: 16 }}>
                  {pastAppts.slice(0, pastShown).map((appt) => (
                    <AppointmentCard key={appt.appointmentId} appt={appt} isPast />
                  ))}
                  {pastAppts.length > pastShown && (
                    <button type="button" className="button" onClick={() => setPastShown((n) => n + PIPELINE_PAGE)}>
                      Show {Math.min(PIPELINE_PAGE, pastAppts.length - pastShown)} more of {pastAppts.length}
                    </button>
                  )}
                </div>
              </div>
            </details>
          )}
        </>
      )}

      {pipelineEmpty && (
        <section className="panel">
          <EmptyState
            title="New requests land here"
            body="When a customer calls, their request waits here for you."
            action={user?.role === "viewer" || !phoneLine ? undefined : { label: "Make a test call", href: `tel:${phoneLine}` }}
            testId="pipeline-empty"
          />
        </section>
      )}
      <RequestReviewDialog
        open={!!reviewLead}
        onClose={() => setReviewLead(null)}
        request={reviewLead ? { ...reviewLead, status: reviewLead.status } : null}
        timeZone={tz}
        smsEnabled={smsEnabled}
        intakeLabelFor={intakeLabelFor}
        jobNoun={vocab.jobNoun}
        canCreateJob={showJobActions}
        onCallBack={reviewLead?.callerPhone ? async () => { await callBackLead(reviewLead); } : undefined}
        onDecline={async (reason, customMessage) => { if (!reviewLead) return; await decideLead(reviewLead, "lost", reason, customMessage); setReviewLead(null); }}
        onAccept={async () => { if (!reviewLead) return; await decideLead(reviewLead, "booked"); if (showJobActions) await createJobFromRequest({ leadId: reviewLead.leadId }); setReviewLead(null); }}
      />
      <RequestReviewDialog
        open={!!reviewAppt}
        onClose={() => setReviewAppt(null)}
        request={reviewAppt ? { ...reviewAppt, serviceRequested: reviewAppt.serviceType, status: reviewAppt.status, assignedCrewName: reviewAppt.assignedCrewId ? crewNames[reviewAppt.assignedCrewId] : undefined } : null}
        timeZone={tz}
        smsEnabled={smsEnabled}
        intakeLabelFor={intakeLabelFor}
        jobNoun={vocab.jobNoun}
        canCreateJob={showJobActions}
        onCallBack={reviewAppt?.callerPhone ? async () => { await callBackAppt(reviewAppt); } : undefined}
        onDecline={async (reason, customMessage) => { if (!reviewAppt) return; await declineAppointment(reviewAppt, reason, customMessage); setReviewAppt(null); }}
        onAccept={async () => { if (!reviewAppt) return; if (!await sendConfirmation(reviewAppt)) return; if (showJobActions && !reviewAppt.jobId) await createJobFromRequest({ appointmentId: reviewAppt.appointmentId }); setReviewAppt(null); }}
      />
    </>
  );
}
