"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessTimezone } from "@/hooks/useBusinessTimezone";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useNewRowIds } from "@/hooks/useNewRowIds";
import { countDashboardMetrics, tilesFor } from "@/lib/verticals/starterKits";
import { StatusChip } from "@/components/ui/StatusChip";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PageError } from "@/components/ui/PageError";
import { EmptyState } from "@/components/ui/EmptyState";
import { setupChecklist, type SetupChecklistInput } from "@/lib/onboarding/setupChecklist";
import { useAuth } from "@/contexts/AuthContext";
import { useBootstrap } from "@/contexts/BootstrapContext";
import { fmtPhone } from "@/lib/format";
import { AlertTriangle, Bot, CheckCircle2, Circle, Clock, LayoutDashboard, Mic, PhoneCall, Settings, Wrench } from "lucide-react";

interface LeadSnapshot {
  leadId: string;
  callerName?: string;
  callerPhone?: string;
  serviceRequested?: string;
  address?: string;
  urgency: string;
  status: string;
  createdAt: number;
}

interface ApptSnapshot {
  appointmentId: string;
  callerName?: string;
  serviceType?: string;
  startTime: number;
  status: string;
  pendingConfirmation?: boolean;
  bookedAfterHours?: boolean;
}

interface JobSnapshot {
  jobId: string;
  title: string;
  clientName?: string;
  address?: string;
  status: string;
  invoiceId?: string;
  lastFieldUpdate?: { at: number; by?: string; text: string };
}

function sinceLabel(at: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

interface AgentSnapshot {
  agentName?: string;
  escalationPhone?: string;
  approvedServices?: string[];
  approvedFaqs?: Array<{ question: string; answer: string }>;
  active?: boolean;
  vapiAssistantId?: string;
  phoneLineConnected?: boolean;
}

interface EscalationSnapshot {
  actionId: string;
  callId: string;
  status: "accepted" | "delivered" | "failed" | "unconfigured";
  createdAt: number;
}

function isToday(ms: number, tz: string): boolean {
  const dStr = new Date(ms).toLocaleDateString("en-US", { timeZone: tz });
  const nowStr = new Date().toLocaleDateString("en-US", { timeZone: tz });
  return dStr === nowStr;
}

function fmtTime(ms: number, tz: string): string {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
}

export default function CompanyDashboardPage() {
  const businessId = useBusinessId();
  const { user } = useAuth();
  const tz = useBusinessTimezone();
  const { isEnabled, ready: modulesReady, vocab, industry } = useBusinessModules();
  const hasJobs = modulesReady && isEnabled("jobs");
  const searchParams = useSearchParams();
  const previewSuffix = searchParams?.get("preview") ? `?preview=${searchParams.get("preview")}` : "";

  const [callCount, setCallCount] = useState<number | null>(null);
  const [leads, setLeads] = useState<LeadSnapshot[]>([]);
  const [appointments, setAppointments] = useState<ApptSnapshot[]>([]);
  const [jobs, setJobs] = useState<JobSnapshot[]>([]);
  const leadRows = useNewRowIds<LeadSnapshot>((lead) => lead.leadId);
  const appointmentRows = useNewRowIds<ApptSnapshot>((appointment) => appointment.appointmentId);
  const jobRows = useNewRowIds<JobSnapshot>((job) => job.jobId);
  const [agent, setAgent] = useState<AgentSnapshot | null>(null);
  const [escalationAlerts, setEscalationAlerts] = useState<EscalationSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const canSeeChecklist = user?.role === "owner" || !!user?.superadmin;
  const phoneLine = useBootstrap().data?.business.phoneLine ?? null;
  const [setup, setSetup] = useState<SetupChecklistInput | null>(null);
  const [checklistHidden, setChecklistHidden] = useState(false);
  const hideKey = user?.uid ? `setup-checklist-hidden:${user.uid}` : null;
  useEffect(() => {
    if (!hideKey) return;
    try { setChecklistHidden(window.localStorage.getItem(hideKey) === "1"); } catch { /* storage unavailable: show it */ }
  }, [hideKey]);
  function toggleChecklist(hidden: boolean) {
    setChecklistHidden(hidden);
    if (!hideKey) return;
    try { if (hidden) window.localStorage.setItem(hideKey, "1"); else window.localStorage.removeItem(hideKey); } catch { /* per-session only */ }
  }

  const initialLoadDone = useRef(false);
  const loadDashboard = useCallback(async () => {
    // Wait for the industry to resolve so we don't fetch jobs for a tenant that has none.
    if (!businessId || !modulesReady) return;

    async function load() {
      try {
        // T-071: server-side reads instead of direct client Firestore queries —
        // one HTTP round trip per collection to our own API (fast, same-origin)
        // instead of the browser opening its own connection to Firestore for
        // each read (connection setup + security-rule evaluation on top of the
        // query itself, over whatever network the browser is on).
        const base = `/api/businesses/${businessId}`;
        // A two-day margin covers the tenant's local day across timezones and DST;
        // isToday below selects the exact local day. The range has no oldest-first cap.
        const now = Date.now();
        const [callCountRes, leadsRes, apptsRes, pendingRes, bizRes, jobsRes, actionsRes, setupRes] = await Promise.all([
          fetch(`${base}/calls?countOnly=1`),
          fetch(`${base}/leads?limit=20`),
          fetch(`${base}/appointments?from=${now - 48 * 3600000}&to=${now + 48 * 3600000}`),
          fetch(`${base}/appointments?pending=1`),
          fetch(`${base}/agent-config`),
          hasJobs ? fetch(`/api/jobs?businessId=${businessId}`) : Promise.resolve(null),
          fetch(`${base}/agent-actions?limit=50`),
          // Only the owner (or a superadmin previewing) sees the checklist — nobody else pays for its count queries.
          canSeeChecklist ? fetch(`/api/company/setup-status?businessId=${businessId}`) : Promise.resolve(null),
        ]);

        if (!callCountRes.ok || !leadsRes.ok || !apptsRes.ok || !pendingRes.ok || !actionsRes.ok || (jobsRes && !jobsRes.ok)) {
          throw new Error("Dashboard data request failed");
        }

        const [callCountData, leadsData, apptsData, pendingData, jobsData, actionsData] = await Promise.all([
          callCountRes.json(),
          leadsRes.json(),
          apptsRes.json(),
          pendingRes.json(),
          jobsRes ? jobsRes.json() : Promise.resolve({ jobs: [] }),
          actionsRes.json(),
        ]);

        // Matches the old bizDoc.exists() check — a missing business doc
        // (pathological, but possible) leaves the Agent Setup panel empty
        // instead of failing the whole dashboard load.
        if (bizRes.ok) {
          const d = await bizRes.json();
          setAgent({
            agentName: d.agentName,
            escalationPhone: d.escalationPhone,
            approvedServices: d.approvedServices,
            approvedFaqs: d.approvedFaqs,
            active: d.active,
            vapiAssistantId: d.vapiAssistantId,
            phoneLineConnected: d.phoneLineConnected,
          });
        }

        setCallCount(callCountData.count);
        if (setupRes?.ok) setSetup(await setupRes.json() as SetupChecklistInput);
        const nextLeads = (leadsData.leads ?? []) as LeadSnapshot[];
        const nextAppointments = [...new Map(
          ([...((apptsData.appointments ?? []) as ApptSnapshot[]), ...((pendingData.appointments ?? []) as ApptSnapshot[])])
            .map((appt) => [appt.appointmentId, appt] as const)
        ).values()].sort((a, b) => a.startTime - b.startTime);
        const nextJobs = (jobsData.jobs ?? []) as JobSnapshot[];
        setLeads(nextLeads); leadRows.track(nextLeads);
        setAppointments(nextAppointments); appointmentRows.track(nextAppointments);
        setJobs(nextJobs); jobRows.track(nextJobs);
        const latestEscalationByCall = new Map<string, EscalationSnapshot>();
        for (const action of (actionsData.actions ?? []) as Array<Record<string, unknown>>) {
          const output = action.output as { status?: unknown } | undefined;
          if (
            action.type !== "escalateCall" ||
            typeof action.callId !== "string" ||
            (output?.status !== "accepted" &&
              output?.status !== "delivered" &&
              output?.status !== "failed" &&
              output?.status !== "unconfigured") ||
            latestEscalationByCall.has(action.callId)
          ) {
            continue;
          }
          latestEscalationByCall.set(action.callId, {
            actionId: action.actionId as string,
            callId: action.callId,
            status: output.status,
            createdAt: typeof action.createdAt === "number" ? action.createdAt : 0,
          });
        }
        setEscalationAlerts(
          [...latestEscalationByCall.values()].filter(
            (item) => item.status !== "delivered"
          )
        );
        initialLoadDone.current = true;
      } catch {
        // A failed background refresh keeps the dashboard on screen; only a failed first load shows the error state.
        if (!initialLoadDone.current) setLoadError(true);
      } finally {
        setLoading(false);
      }
    }

    return load();
  }, [businessId, modulesReady, hasJobs, canSeeChecklist]);
  useEffect(() => { void loadDashboard(); }, [loadDashboard]);
  useLiveRefresh(loadDashboard, { intervalMs: 10_000, enabled: Boolean(businessId && modulesReady) });

  const urgentLeads = leads.filter((l) => l.urgency === "urgent" || l.urgency === "Urgent" || l.status === "new");
  // Tile count matches the Pipeline "Urgent" filter destination (truly urgent only).
  const trulyUrgentCount = leads.filter((l) => l.urgency === "urgent" || l.urgency === "Urgent").length;
  const todayAppointments = appointments.filter((a) => isToday(a.startTime, tz) && a.status !== "cancelled");
  const pendingAppts = appointments.filter((a) => a.pendingConfirmation && a.status !== "confirmed" && a.status !== "cancelled");
  const activeJobs = jobs.filter((j) => j.status !== "complete");
  // Crew notes (voice or typed) used to be visible only inside each job (2026-09-28: "does it get noticed somewhere?").
  const fieldActivity = jobs
    .filter((j) => j.lastFieldUpdate && Date.now() - j.lastFieldUpdate.at < 7 * 86_400_000)
    .sort((a, b) => b.lastFieldUpdate!.at - a.lastFieldUpdate!.at)
    .slice(0, 5);
  const apptTabHref = `/company/pipeline${previewSuffix ? previewSuffix + "&tab=appointments" : "?tab=appointments"}`;
  // A phone line on EITHER provider counts (the old check looked only at Vapi, so an ElevenLabs tenant read as inactive).
  const isAgentActive = agent?.phoneLineConnected ?? (agent?.vapiAssistantId ? true : (agent?.active ?? false));

  const genericMetrics = [
    { label: "Total calls", value: callCount ?? "—", href: `/company/calls${previewSuffix}` },
    { label: "Leads", value: leads.length, href: `/company/pipeline${previewSuffix}` },
    { label: "Urgent leads", value: trulyUrgentCount, href: `/company/pipeline${previewSuffix ? previewSuffix + "&urgency=urgent" : "?urgency=urgent"}` },
    { label: "Appointments", value: appointments.length, href: `/company/pipeline${previewSuffix ? previewSuffix + "&tab=appointments" : "?tab=appointments"}` },
  ];
  const counts = countDashboardMetrics(leads, appointments, jobs, tz, Date.now());
  const configuredTiles = tilesFor(industry);
  // Tile counts come from the same bounded lists the rest of this page already loads (20 newest
  // leads / 200 soonest appointments), so a very busy tenant's counts are "of the recent ones" —
  // deliberately not a bigger fetch on the most-visited page. Total calls stays as the fourth tile.
  const totalCallsTile = { label: "Total calls", value: callCount ?? "—", href: `/company/calls${previewSuffix}` };
  const metrics = configuredTiles
    ? [...configuredTiles.map((tile) => ({
        label: tile.label,
        value: counts[tile.metric],
        href: tile.href === "jobs"
          ? `/company/jobs${previewSuffix}`
          : `/company/pipeline${previewSuffix ? `${previewSuffix}&tab=${tile.href === "appointments" ? "appointments" : "leads"}` : `?tab=${tile.href === "appointments" ? "appointments" : "leads"}`}`,
      })), totalCallsTile]
    : genericMetrics;

  const agentSettings = agent
    ? [
        ["Agent name", agent.agentName ?? "AI receptionist"],
        ["Status", isAgentActive ? "Active — answering calls" : "Inactive"],
        ["Escalation", agent.escalationPhone ?? "—"],
        ["Approved services", `${agent.approvedServices?.length ?? 0} configured`],
        ["Approved FAQs", `${agent.approvedFaqs?.length ?? 0} answers`],
        ["Calendar", "Scheduling enabled"],
      ]
    : [];

  const allClear = pendingAppts.length === 0 && urgentLeads.length === 0 && todayAppointments.length === 0 && activeJobs.length === 0 && fieldActivity.length === 0 && escalationAlerts.length === 0;
  const checklist = setup ? setupChecklist(setup, { isEnabled }, vocab) : [];
  const checklistDone = checklist.filter((item) => item.done).length;
  const nextItemId = checklist.find((item) => !item.done && item.href)?.id;
  const showsChecklist = canSeeChecklist && checklist.length > 0 && checklistDone < checklist.length;
  const neverHadCall = callCount === 0;
  const lineConnected = setup ? setup.phoneConfigured : !!agent?.phoneLineConnected;

  if (loading) {
    return <PageSkeleton metrics={4} rows={4} />;
  }
  if (loadError) {
    return (
      <PageError
        message="Dashboard data could not be loaded. No activity summary is being shown."
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <>
      {showsChecklist && checklistHidden && (
        <div className="panel setup-checklist-collapsed" style={{ marginBottom: 20 }}>
          <span>Setup {checklistDone}/{checklist.length}</span>
          <button type="button" className="button small" onClick={() => toggleChecklist(false)}>Continue</button>
        </div>
      )}
      {showsChecklist && !checklistHidden && (
        <section className="panel" aria-label="Get your business ready" style={{ marginBottom: 20 }}>
          <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <h2 className="panel-title">Get your business ready — {checklistDone}/{checklist.length}</h2>
            <button type="button" className="button ghost small" onClick={() => toggleChecklist(true)}>Hide for now</button>
          </div>
          <div className="panel-body">
            <ul className="setup-checklist" data-testid="setup-checklist">
              {checklist.map((item) => (
                <li key={item.id} className={`setup-checklist-row${item.done ? " is-done" : ""}`}>
                  {item.done
                    ? <CheckCircle2 size={18} strokeWidth={1.75} aria-label="Done" />
                    : <Circle size={18} strokeWidth={1.75} aria-label="Not done" />}
                  <span>{item.label}</span>
                  {/* Only the next step is primary, so the card never shows a row of competing teal buttons. */}
                  {!item.done && item.href && item.cta && (
                    <Link className={`button small${item.id === nextItemId ? " primary" : ""}`} href={item.href}>{item.cta}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      <header className="page-header">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LayoutDashboard size={20} strokeWidth={1.75} />
            Today&apos;s Work
          </h1>
          <p className="page-subtitle">
            {hasJobs
              ? `Urgent leads, today's appointments, active ${vocab.jobNounPlural.toLowerCase()}, and agent status.`
              : "Urgent leads, today's appointments, and agent status."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {pendingAppts.length > 0 && (
            <Link
              href={apptTabHref}
              className="status-pill"
              style={{ background: "#fffbeb", color: "#92400e", borderColor: "#fcd34d", textDecoration: "none" }}
            >
              {pendingAppts.length} pending approval
            </Link>
          )}
          <span className="status-pill">{isAgentActive ? "Agent active" : "Agent inactive"}</span>
        </div>
      </header>

      {escalationAlerts.length > 0 && (
        <div
          role="alert"
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #fca5a5",
            background: "#fef2f2",
            color: "#991b1b",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <strong>
              {escalationAlerts.length} urgent escalation
              {escalationAlerts.length === 1 ? " needs" : "s need"} attention
            </strong>
            <div style={{ fontSize: 12, marginTop: 2 }}>
              Notification {escalationAlerts[0].status === "accepted" ? "is still pending" : "was not delivered"}. Review the call; delivery remains safe to retry.
            </div>
          </div>
          <Link
            href={`/company/calls${previewSuffix}`}
            className="button small"
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <PhoneCall size={13} strokeWidth={1.75} />
            Review calls
          </Link>
        </div>
      )}

      <section className="metric-grid" aria-label="Summary">
        {metrics.map((metric) => (
          <Link
            href={metric.href}
            key={metric.label}
            className="metric"
            style={{ textDecoration: "none", cursor: "pointer" }}
          >
            <p className="metric-label">{metric.label}</p>
            <p className="metric-value">{metric.value}</p>
          </Link>
        ))}
      </section>

      <div className="ops-grid">
        {/* Today Feed */}
        <div>
          {pendingAppts.length > 0 && (
            <div className="feed-section">
              <div className="feed-section-header">
                <p className="feed-section-title">New bookings to confirm</p>
                <span className="feed-section-count">{pendingAppts.length}</span>
              </div>
              {pendingAppts.slice(0, 6).map((appt) => (
                <Link key={appt.appointmentId} href={`${apptTabHref}&appt=${appt.appointmentId}`} className={`feed-row${appointmentRows.newIds.has(appt.appointmentId) ? " row-new" : ""}`}>
                  <div className="feed-icon feed-icon--appt" style={{ background: "#fef3c7", color: "#92400e" }}><Clock size={14} /></div>
                  <div className="feed-body">
                    <p className="feed-name">{appt.callerName ?? "Unknown"}</p>
                    <p className="feed-sub">{fmtTime(appt.startTime, tz)} · {appt.serviceType ?? "Inspection"}{appt.bookedAfterHours === true ? " · after hours" : ""}</p>
                  </div>
                  {appt.bookedAfterHours === true
                    ? <StatusChip status="after_hours" />
                    : <StatusChip status="requested" label="New booking · confirm" />}
                  <span className="feed-chevron">›</span>
                </Link>
              ))}
            </div>
          )}

          {urgentLeads.length > 0 && (
            <div className="feed-section">
              <div className="feed-section-header">
                <p className="feed-section-title">Needs Attention</p>
                <span className="feed-section-count">{urgentLeads.length}</span>
              </div>
              {urgentLeads.slice(0, 5).map((lead) => (
                <Link key={lead.leadId} href={`/company/pipeline${previewSuffix}`} className={`feed-row${leadRows.newIds.has(lead.leadId) ? " row-new" : ""}`}>
                  <div className="feed-icon feed-icon--urgent"><AlertTriangle size={14} /></div>
                  <div className="feed-body">
                    <p className="feed-name">{lead.callerName ?? lead.callerPhone ?? "Unknown caller"}</p>
                    <p className="feed-sub">{lead.serviceRequested ?? lead.address ?? "New lead"}</p>
                  </div>
                  <StatusChip status={lead.urgency === "urgent" || lead.urgency === "Urgent" ? "urgent" : "new"} />
                  <span className="feed-chevron">›</span>
                </Link>
              ))}
            </div>
          )}

          {todayAppointments.length > 0 && (
            <div className="feed-section">
              <div className="feed-section-header">
                <p className="feed-section-title">Today&apos;s Appointments</p>
                <span className="feed-section-count">{todayAppointments.length}</span>
              </div>
              {todayAppointments.map((appt) => (
                <Link key={appt.appointmentId} href={`/company/pipeline${previewSuffix ? previewSuffix + "&tab=appointments" : "?tab=appointments"}`} className={`feed-row${appointmentRows.newIds.has(appt.appointmentId) ? " row-new" : ""}`}>
                  <div className="feed-icon feed-icon--appt"><Clock size={14} /></div>
                  <div className="feed-body">
                    <p className="feed-name">{appt.callerName ?? "Unknown"}</p>
                    <p className="feed-sub">{fmtTime(appt.startTime, tz)} · {appt.serviceType ?? "Inspection"}</p>
                  </div>
                  <StatusChip status={appt.status} />
                  <span className="feed-chevron">›</span>
                </Link>
              ))}
            </div>
          )}

          {hasJobs && fieldActivity.length > 0 && (
            <div className="feed-section" data-testid="dashboard-field-activity">
              <div className="feed-section-header">
                <p className="feed-section-title">Latest from the field</p>
                <span className="feed-section-count">{fieldActivity.length}</span>
              </div>
              {fieldActivity.map((job) => (
                <Link key={job.jobId} href={`/company/jobs/${job.jobId}${previewSuffix}`} className="feed-row">
                  <div className="feed-icon feed-icon--job"><Mic size={14} /></div>
                  <div className="feed-body">
                    <p className="feed-name">{job.lastFieldUpdate!.by ?? "Crew"} on {job.jobId} · {sinceLabel(job.lastFieldUpdate!.at)}</p>
                    <p className="feed-sub">&ldquo;{job.lastFieldUpdate!.text}&rdquo;</p>
                  </div>
                  <span className="feed-chevron">›</span>
                </Link>
              ))}
            </div>
          )}

          {hasJobs && activeJobs.length > 0 && (
            <div className="feed-section">
              <div className="feed-section-header">
                <p className="feed-section-title">Active {vocab.jobNounPlural}</p>
                <span className="feed-section-count">{activeJobs.length}</span>
              </div>
              {activeJobs.slice(0, 5).map((job) => (
                <Link key={job.jobId} href={`/company/jobs/${job.jobId}${previewSuffix}`} className={`feed-row${jobRows.newIds.has(job.jobId) ? " row-new" : ""}`}>
                  <div className="feed-icon feed-icon--job"><Wrench size={14} /></div>
                  <div className="feed-body">
                    <p className="feed-name">{job.jobId} — {job.title}</p>
                    <p className="feed-sub">{job.clientName ?? job.address ?? "—"}</p>
                  </div>
                  <StatusChip status={job.status} />
                  <span className="feed-chevron">›</span>
                </Link>
              ))}
            </div>
          )}

          {/* Plan §3.2: a brand-new account never sees "All caught up" — the checklist (owners) or the phone-line prompt is the page's job. */}
          {allClear && !neverHadCall && (
            <div className="feed-empty">All caught up — nothing urgent right now.</div>
          )}
          {allClear && neverHadCall && !showsChecklist && (lineConnected ? (
            <EmptyState
              icon={PhoneCall}
              title="Your phone line is ready"
              body={phoneLine
                ? `Call ${fmtPhone(phoneLine)} to hear your AI receptionist. The call shows up here in seconds.`
                : "Call your business line to hear your AI receptionist. The call shows up here in seconds."}
              action={phoneLine && user?.role !== "viewer" ? { label: "Call your line", href: `tel:${phoneLine}` } : undefined}
              testId="dashboard-empty-phone"
            />
          ) : (
            <EmptyState
              icon={PhoneCall}
              title="Your phone line is being connected"
              body="Calls show up here as soon as it's live."
              testId="dashboard-empty-connecting"
            />
          ))}
        </div>

        {/* Agent Setup panel - unchanged */}
        <aside className="panel" aria-labelledby="agent-title">
          <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 className="panel-title" id="agent-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Bot size={16} strokeWidth={1.75} />
              Agent Setup
            </h2>
            <Link href={`/company/settings${previewSuffix}`} style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Settings size={13} strokeWidth={1.75} />
              Settings
            </Link>
          </div>
          <div className="panel-body">
            {agentSettings.length === 0 ? (
              <p style={{ color: "#888", fontSize: 14 }}>Agent config not loaded.</p>
            ) : (
              <div className="settings-list">
                {agentSettings.map(([label, value]) => (
                  <div className="settings-row" key={label}>
                    <p>{label}</p>
                    <span>{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
