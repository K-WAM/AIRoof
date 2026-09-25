"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessTimezone } from "@/hooks/useBusinessTimezone";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { findCallLinks } from "@/lib/pipeline/callLinks";
import { getVerticalTemplate } from "@/lib/verticals/templates";
import { RequestReviewDialog } from "@/components/requests/RequestReviewDialog";
import type { RequestDeclineReason } from "@/lib/comms/requestDeclineEmail";
import { StatusChip } from "@/components/ui/StatusChip";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PageError } from "@/components/ui/PageError";
import { ArrowRight, Clock, Headphones, History, PhoneCall } from "lucide-react";

interface CallMessage {
  role: "caller" | "agent" | "system" | string;
  text: string;
  timestamp: number;
}

interface Call {
  callId: string;
  callerPhone?: string;
  targetPhone?: string;
  callType?: "inbound" | "outbound";
  status: string;
  startedAt: number;
  endedAt?: number;
  summary?: string;
  recordingUrl?: string;
  endedReason?: string;
  outcome?: "scheduled" | "escalated" | "lead_captured" | "no_action";
  outcomeReason?: string;
  isAfterHours?: boolean;
  messages: CallMessage[];
}

// Slim shapes of what the leads/appointments list routes return — only the
// fields the call→lead/appt link needs (both routes already return full docs,
// including sourceCallId, so no API change was required).
interface LeadRef {
  leadId: string;
  sourceCallId?: string;
  callerName?: string; callerPhone?: string; callerEmail?: string; serviceRequested?: string; address?: string; urgency?: string; preferredTime?: string; notes?: string; intake?: Record<string, string>; status?: string;
}

interface AppointmentRef {
  appointmentId: string;
  sourceCallId?: string;
  callerName?: string; callerPhone?: string; callerEmail?: string; serviceType?: string; address?: string; notes?: string; intake?: Record<string, string>; startTime?: number; status?: string;
}

function formatTime(ms: number, tz: string): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: tz,
  });
}

function callDuration(call: Call): string {
  if (!call.endedAt || !call.startedAt) return "";
  const secs = Math.round((call.endedAt - call.startedAt) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function guessCategory(messages: CallMessage[]): "Emergency" | "Scheduling" | "Service question" | "General" {
  const text = messages.filter(m => m.role !== "system").map(m => m.text).join(" ").toLowerCase();
  if (text.includes("leak") || text.includes("water") || text.includes("flood") || text.includes("emergency")) return "Emergency";
  if (text.includes("inspect") || text.includes("appointment") || text.includes("book") || text.includes("schedule")) return "Scheduling";
  if (text.includes("price") || text.includes("cost") || text.includes("quote") || text.includes("how much")) return "Service question";
  return "General";
}

const CATEGORY_STATUS: Record<string, string> = {
  Emergency: "emergency",
  Scheduling: "scheduling",
  "Service question": "service",
  General: "general",
};

export default function CompanyCallsPage() {
  const businessId = useBusinessId();
  const tz = useBusinessTimezone();
  const { vocab, isEnabled, industry } = useBusinessModules();
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");

  const [calls, setCalls] = useState<Call[]>([]);
  const [selected, setSelected] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [dirFilter, setDirFilter] = useState<"all" | "inbound" | "outbound">("all");
  // T-084: leads/appointments lists, fetched solely to resolve which lead or
  // appointment (if any) each call produced, by matching on sourceCallId.
  const [linkedLeads, setLinkedLeads] = useState<LeadRef[]>([]);
  const [linkedAppts, setLinkedAppts] = useState<AppointmentRef[]>([]);
  const [review, setReview] = useState<{ lead?: LeadRef; appointment?: AppointmentRef; call: Call } | null>(null);

  const loadCalls = useCallback(async () => {
    if (!businessId) return;
    // T-071: server-side admin-SDK read instead of a direct client Firestore
    // query — see the leads route for the full round-trip-time rationale.
    return fetch(`/api/businesses/${businessId}/calls`)
      .then((r) => {
        if (!r.ok) throw new Error("Calls request failed");
        return r.json();
      })
      .then(({ calls }: { calls: Call[] }) => {
        const data = calls ?? [];
        setCalls(data);
        if (data.length > 0) setSelected(data[0]);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [businessId]);
  useEffect(() => { void loadCalls(); }, [loadCalls]);
  useLiveRefresh(loadCalls, { intervalMs: 10_000, enabled: Boolean(businessId) });

  const intakeLabelFor = (key: string) => getVerticalTemplate(industry ?? "roofing").intakeFields.find((field) => field.key === key)?.label ?? key;
  async function callBack(targetPhone?: string, leadId?: string, appointmentId?: string) {
    if (!targetPhone) return;
    const response = await fetch("/api/calls/outbound", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetPhone, leadId, appointmentId }) });
    if (!response.ok) throw new Error("Callback could not be started");
  }
  async function createJobFromRequest(request: { appointmentId?: string; leadId?: string }) {
    const res = await fetch("/api/jobs/from-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, ...request }) });
    if (!res.ok) throw new Error("Job creation failed");
    const { job } = await res.json() as { job: { jobId: string } };
    window.location.href = `/company/jobs/${job.jobId}${preview ? `?preview=${preview}` : ""}`;
  }
  async function decideReview(status: "booked" | "lost" | "confirmed" | "cancelled", reason?: RequestDeclineReason, customMessage?: string) {
    if (!review) return;
    if (review.lead) {
      const response = await fetch(`/api/businesses/${businessId}/leads/${review.lead.leadId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, status, ...(reason ? { declineReason: reason, customMessage } : {}) }) });
      if (!response.ok) throw new Error("Request decision failed");
    } else if (review.appointment) {
      const response = reason
        ? await fetch(`/api/appointments/${review.appointment.appointmentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, declineReason: reason, customMessage }) })
        : await fetch("/api/appointments/send-confirmation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, appointmentId: review.appointment.appointmentId }) });
      if (!response.ok) throw new Error("Request decision failed");
    }
  }

  // Best-effort fetch of the leads/appointments lists for the call → outcome
  // links. A failure here must never fail the page — the transcript view is
  // the point, and the links simply don't render.
  useEffect(() => {
    if (!businessId) return;
    const base = `/api/businesses/${businessId}`;
    Promise.all([fetch(`${base}/leads`), fetch(`${base}/appointments`)])
      .then(async ([leadsRes, apptsRes]) => {
        if (!leadsRes.ok || !apptsRes.ok) return;
        const [{ leads }, { appointments }] = (await Promise.all([
          leadsRes.json(),
          apptsRes.json(),
        ])) as [{ leads: LeadRef[] }, { appointments: AppointmentRef[] }];
        setLinkedLeads(leads ?? []);
        setLinkedAppts(appointments ?? []);
      })
      .catch(() => {});
  }, [businessId]);

  if (loading) return <PageSkeleton rows={6} />;
  if (loadError) {
    return (
      <PageError
        message="Call history could not be loaded. No call data is being shown."
        onRetry={() => window.location.reload()}
      />
    );
  }

  const conversationMessages = (call: Call) =>
    (call.messages ?? []).filter((m) => m.role === "caller" || m.role === "agent");

  const filteredCalls = calls.filter((c) => {
    if (dirFilter === "inbound") return c.callType !== "outbound";
    if (dirFilter === "outbound") return c.callType === "outbound";
    return true;
  });

  // T-084: the lead/appointment the selected call produced, if any. Both
  // undefined means the call produced neither — render no link at all.
  const selectedLinks = selected ? findCallLinks(selected.callId, linkedLeads, linkedAppts) : null;
  const leadHref = selectedLinks?.leadId
    ? `/company/pipeline${preview ? `?preview=${preview}&` : "?"}tab=leads&lead=${selectedLinks.leadId}`
    : null;
  const apptHref = selectedLinks?.appointmentId
    ? `/company/pipeline${preview ? `?preview=${preview}&` : "?"}tab=appointments&appt=${selectedLinks.appointmentId}`
    : null;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PhoneCall size={20} strokeWidth={1.75} />
            Calls
          </h1>
          <p className="page-subtitle">
            Every call Alice answered — full transcript and AI summary.
          </p>
        </div>
        <span className="status-pill">{calls.length} total</span>
      </header>

      <div className="call-workspace">
        <section className="panel" aria-labelledby="call-list-title">
          <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 className="panel-title" id="call-list-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <History size={16} strokeWidth={1.75} />
              Call History
            </h2>
            <div className="segmented-control" style={{ fontSize: 12 }}>
              {(["all", "inbound", "outbound"] as const).map((f) => (
                <button key={f} className="segment" type="button" aria-pressed={dirFilter === f} onClick={() => setDirFilter(f)}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="panel-body">
            {filteredCalls.length === 0 ? (
              <p style={{ color: "#888", fontSize: 14 }}>No calls yet. Calls appear here after Alice answers the phone.</p>
            ) : (
              <div className="call-list">
                <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--text-muted)" }}>Click a call to read its transcript and play the recording.</p>
                {filteredCalls.map((call) => {
                  const msgs = conversationMessages(call);
                  const category = guessCategory(msgs);
                  const dur = callDuration(call);
                  const isOutbound = call.callType === "outbound";
                  const displayPhone = isOutbound ? (call.targetPhone ?? "Outbound") : (call.callerPhone ?? "Unknown caller");
                  return (
                    <article
                      className="call-row"
                      key={call.callId}
                      aria-selected={selected?.callId === call.callId}
                      onClick={() => setSelected(call)}
                      style={{ cursor: "pointer" }}
                    >
                      <div className="call-row-header">
                        <div>
                          <p className="call-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {isOutbound && <span style={{ fontSize: 11, color: "#0f766e", fontWeight: 700 }}>→ OUT</span>}
                            {displayPhone}
                            {call.recordingUrl && <Headphones size={13} style={{ color: "var(--accent)", flexShrink: 0 }} aria-label="Recording available" />}
                          </p>
                          <p className="call-subtitle">{formatTime(call.startedAt, tz)}</p>
                        </div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {call.outcome && <StatusChip status={call.outcome} />}
                          {call.isAfterHours && <StatusChip status="after_hours" />}
                          {!call.outcome && <StatusChip status={CATEGORY_STATUS[category] ?? "general"} label={category} />}
                        </div>
                      </div>
                      <p className="call-subtitle">
                        {call.status}{dur ? ` · ${dur}` : ""} · {msgs.length} turns
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="panel" aria-labelledby="call-detail-title">
          <div className="panel-header">
            <h2 className="panel-title" id="call-detail-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Headphones size={16} strokeWidth={1.75} />
              Call Detail
            </h2>
          </div>
          <div className="panel-body">
            {!selected ? (
              <p style={{ color: "#888", fontSize: 14 }}>Select a call to view its transcript.</p>
            ) : (
              <>
                <div className="call-detail-meta">
                  <div>
                    <p className="call-detail-phone">
                      {selected.callType === "outbound" && <span style={{ fontSize: 12, color: "#0f766e", fontWeight: 700, marginRight: 6 }}>→ OUT</span>}
                      {selected.callType === "outbound" ? (selected.targetPhone ?? "Outbound") : (selected.callerPhone ?? "Unknown caller")}
                    </p>
                    <p className="call-detail-sub">
                      {formatTime(selected.startedAt, tz)}
                      {callDuration(selected) ? ` · ${callDuration(selected)}` : ""}
                      {selected.endedReason ? ` · ${selected.endedReason}` : ""}
                    </p>
                  </div>
                </div>

                {(leadHref || apptHref) && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      marginBottom: 16,
                      padding: "10px 14px",
                      background: "#f0fdfa",
                      border: "1px solid #99f6e4",
                      borderRadius: 8,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#0f766e", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      This call produced
                    </span>
                    {leadHref && (
                      <Link className="button small" href={leadHref} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        View lead <ArrowRight size={13} />
                      </Link>
                    )}
                    {apptHref && (
                      <Link className="button small secondary" href={apptHref} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        View appointment <ArrowRight size={13} />
                      </Link>
                    )}
                    <button className="button small secondary" type="button" onClick={() => setReview({ lead: selectedLinks?.leadId ? linkedLeads.find((lead) => lead.leadId === selectedLinks.leadId) : undefined, appointment: selectedLinks?.appointmentId ? linkedAppts.find((appointment) => appointment.appointmentId === selectedLinks.appointmentId) : undefined, call: selected })}>Review request</button>
                  </div>
                )}

                {selected.recordingUrl && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <Headphones size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
                    <audio controls src={selected.recordingUrl} style={{ width: "100%", height: 36 }} />
                  </div>
                )}

                {selected.outcome && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                    <StatusChip status={selected.outcome} />
                    {selected.isAfterHours && <StatusChip status="after_hours" />}
                    {selected.outcomeReason && <span style={{ fontSize: 12, color: "#64748b" }}>{selected.outcomeReason}</span>}
                  </div>
                )}

                {selected.isAfterHours && selected.outcome !== "scheduled" && (
                  <div style={{ padding: "10px 14px", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, marginBottom: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <Clock size={18} style={{ flexShrink: 0 }} />
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#92400e" }}>Appointment not booked — after hours</p>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "#b45309" }}>
                        This call came in outside business hours. The request has been captured as a lead for follow-up. Call the customer back during business hours to confirm.
                      </p>
                    </div>
                  </div>
                )}

                {selected.summary && (
                  <div className="summary-block">
                    <p style={{ fontWeight: 700, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 6px" }}>
                      AI Summary
                    </p>
                    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{selected.summary}</p>
                  </div>
                )}

                {conversationMessages(selected).length === 0 ? (
                  <p style={{ color: "#888", fontSize: 14 }}>No transcript — call may have dropped or been a test.</p>
                ) : (
                  <div className="transcript" aria-label="Call transcript">
                    {conversationMessages(selected).map((msg, i) => (
                      <article
                        className={msg.role === "agent" ? "message agent" : "message"}
                        key={i}
                      >
                        <p className="message-role">{msg.role === "agent" ? "Alice" : "Caller"}</p>
                        <p className="message-text">{msg.text}</p>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
      <RequestReviewDialog
        open={!!review}
        onClose={() => setReview(null)}
        request={review?.lead ? { ...review.lead, status: review.lead.status ?? "new" } : review?.appointment ? { ...review.appointment, serviceRequested: review.appointment.serviceType, status: review.appointment.status ?? "requested" } : null}
        call={review ? { summary: review.call.summary, recordingUrl: review.call.recordingUrl, transcript: review.call.messages } : undefined}
        intakeLabelFor={intakeLabelFor}
        jobNoun={vocab.jobNoun}
        canCreateJob={isEnabled("jobs")}
        onCallBack={review ? async () => callBack(review.lead?.callerPhone ?? review.appointment?.callerPhone, review.lead?.leadId, review.appointment?.appointmentId) : undefined}
        onDecline={async (reason, customMessage) => { await decideReview(review?.lead ? "lost" : "cancelled", reason, customMessage); setReview(null); }}
        onAccept={async (notifyByCall) => { if (!review) return; await decideReview(review.lead ? "booked" : "confirmed"); if (notifyByCall) await callBack(review.lead?.callerPhone ?? review.appointment?.callerPhone, review.lead?.leadId, review.appointment?.appointmentId); if (isEnabled("jobs")) await createJobFromRequest({ leadId: review.lead?.leadId, appointmentId: review.appointment?.appointmentId }); setReview(null); }}
      />
    </>
  );
}
