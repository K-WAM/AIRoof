"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getFirebaseDb } from "@/lib/firebase/client";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessTimezone } from "@/hooks/useBusinessTimezone";
import { StatusChip } from "@/components/ui/StatusChip";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PageError } from "@/components/ui/PageError";
import { CalendarDays, Check, Clock, History, ListTodo, Phone, UserRound, Workflow } from "lucide-react";

type Tab = "leads" | "appointments";

interface Lead {
  leadId: string;
  callerName?: string;
  callerPhone?: string;
  serviceRequested?: string;
  address?: string;
  urgency: string;
  notes?: string;
  status: string;
  sourceCallId?: string;
  createdAt: number;
}

interface Appointment {
  appointmentId: string;
  callerName?: string;
  callerPhone?: string;
  callerEmail?: string;
  serviceType?: string;
  address?: string;
  notes?: string;
  startTime: number;
  endTime: number;
  status: string;
  pendingConfirmation?: boolean;
  createdAt: number;
  sourceCallId?: string;
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

export default function PipelinePage() {
  const businessId = useBusinessId();
  const tz = useBusinessTimezone();
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");
  const previewSuffix = preview ? `?preview=${preview}` : "";

  const urgencyParam = searchParams?.get("urgency");
  const leadParam = searchParams?.get("lead");
  const initialTab: Tab = searchParams?.get("tab") === "appointments" ? "appointments" : "leads";
  const [tab, setTab] = useState<Tab>(initialTab);

  // Leads state
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadFilter, setLeadFilter] = useState<"all" | "urgent" | "new" | "contacted">(urgencyParam === "urgent" ? "urgent" : "all");
  const [leadCalling, setLeadCalling] = useState<string | null>(null);
  const [leadUpdating, setLeadUpdating] = useState(false);

  // Appointments state
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [apptUpdating, setApptUpdating] = useState<string | null>(null);
  const [confirmedSet, setConfirmedSet] = useState<Set<string>>(new Set());
  const [apptCalling, setApptCalling] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: "error" | "warn" | "ok" } | null>(null);

  function showToast(msg: string, tone: "error" | "warn" | "ok" = "error") {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 4500);
  }

  useEffect(() => {
    if (!businessId) return;
    (async () => {
      const db = await getFirebaseDb();
      if (!db) { setLoadError(true); setLoading(false); return; }
      const { collection, getDocs, query, orderBy } = await import("firebase/firestore");
      Promise.all([
        getDocs(query(collection(db, `businesses/${businessId}/leads`), orderBy("createdAt", "desc"))),
        getDocs(query(collection(db, `businesses/${businessId}/appointments`), orderBy("startTime", "asc"))),
      ])
        .then(([leadsSnap, apptsSnap]) => {
          const leadsData = leadsSnap.docs.map((d) => ({ leadId: d.id, ...d.data() } as Lead));
          setLeads(leadsData);
          const chosenLead = leadParam ? leadsData.find((l) => l.leadId === leadParam) : undefined;
          setSelectedLead(chosenLead ?? leadsData[0] ?? null);
          setAppointments(apptsSnap.docs.map((d) => ({ appointmentId: d.id, ...d.data() } as Appointment)));
        })
        .catch(() => setLoadError(true))
        .finally(() => setLoading(false));
    })();
  }, [businessId]);

  // --- Lead actions ---
  async function callBackLead(lead: Lead) {
    if (!lead.callerPhone) return;
    setLeadCalling(lead.leadId);
    try {
      const res = await fetch("/api/calls/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPhone: lead.callerPhone, leadId: lead.leadId }),
      });
      if (!res.ok) {
        showToast("The callback could not be started. Try again.");
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
      const db = await getFirebaseDb();
      if (!db) return;
      const { doc, updateDoc } = await import("firebase/firestore");
      await updateDoc(doc(db, `businesses/${businessId}/leads`, lead.leadId), {
        status: "contacted",
        updatedAt: Date.now(),
      });
      setLeads((prev) => prev.map((l) => (l.leadId === lead.leadId ? { ...l, status: "contacted" } : l)));
      if (selectedLead?.leadId === lead.leadId) setSelectedLead({ ...lead, status: "contacted" });
      showToast("Marked as contacted.", "ok");
    } catch {
      showToast("Couldn't update the lead. Try again.");
    } finally {
      setLeadUpdating(false);
    }
  }

  // --- Appointment actions ---
  async function updateApptStatus(appt: Appointment, status: string) {
    setApptUpdating(appt.appointmentId);
    try {
      const db = await getFirebaseDb();
      if (!db) return;
      const { doc, updateDoc } = await import("firebase/firestore");
      await updateDoc(doc(db, `businesses/${businessId}/appointments`, appt.appointmentId), {
        status, updatedAt: Date.now(),
      });
      setAppointments((prev) =>
        prev.map((a) => (a.appointmentId === appt.appointmentId ? { ...a, status } : a))
      );
    } catch {
      showToast("The appointment could not be updated. Try again.");
    } finally {
      setApptUpdating(null);
    }
  }

  function createJob(appt: Appointment) {
    const params = new URLSearchParams({
      clientName: appt.callerName ?? "",
      clientPhone: appt.callerPhone ?? "",
      address: appt.address ?? "",
      serviceType: appt.serviceType ?? "",
      appointmentId: appt.appointmentId,
    });
    if (preview) params.set("preview", preview);
    window.location.href = `/company/jobs?${params.toString()}#new`;
  }

  async function callBackAppt(appt: Appointment) {
    if (!appt.callerPhone) return;
    setApptCalling(appt.appointmentId);
    try {
      const res = await fetch("/api/calls/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPhone: appt.callerPhone, appointmentId: appt.appointmentId }),
      });
      if (!res.ok) {
        showToast("The callback could not be started. Try again.");
      }
    } catch {
      showToast("Network error — could not initiate call.");
    } finally {
      setApptCalling(null);
    }
  }

  async function sendConfirmation(appt: Appointment) {
    setApptUpdating(appt.appointmentId + "_confirm");
    try {
      const res = await fetch("/api/appointments/send-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, appointmentId: appt.appointmentId }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({} as { notifiedCustomer?: boolean; customerEmail?: string | null }));
        setConfirmedSet((prev) => new Set(prev).add(appt.appointmentId));
        setAppointments((prev) =>
          prev.map((a) => (a.appointmentId === appt.appointmentId ? { ...a, status: "confirmed" } : a))
        );
        if (data.notifiedCustomer && data.customerEmail) {
          showToast(`Confirmed — customer notified at ${data.customerEmail}`, "ok");
        } else {
          showToast("Confirmed. No customer email on file — reach out to the customer directly.", "warn");
        }
        setTimeout(() => {
          setConfirmedSet((prev) => {
            const next = new Set(prev);
            next.delete(appt.appointmentId);
            return next;
          });
        }, 3000);
      } else {
        showToast("Couldn't confirm the appointment. Try again.");
      }
    } catch {
      showToast("Network error — couldn't confirm the appointment.");
    } finally {
      setApptUpdating(null);
    }
  }

  const filteredLeads = leads.filter((l) => {
    if (leadFilter === "urgent") return l.urgency === "urgent" || l.urgency === "Urgent";
    if (leadFilter === "new") return l.status === "new";
    if (leadFilter === "contacted") return l.status === "contacted";
    return true;
  });

  const newLeadsCount = leads.filter((l) => l.status === "new").length;
  const upcomingAppts = appointments.filter((a) => a.startTime > Date.now() && a.status !== "cancelled");
  const pastAppts = appointments.filter((a) => a.startTime <= Date.now() || a.status === "cancelled");
  const pendingCount = appointments.filter(
    (a) => a.pendingConfirmation && a.status !== "confirmed" && a.status !== "cancelled"
  ).length;

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

    return (
      <article
        className="appt-card"
        style={{
          opacity: isPast ? 0.75 : 1,
          ...(isPending ? { borderLeft: "4px solid #f59e0b", background: "#fffdf7" } : {}),
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
              ? <StatusChip status="requested" label="After-hours · unconfirmed" />
              : <StatusChip status={appt.status} />}
          </div>
          {isPending && (
            <div style={{ margin: "8px 0", padding: "8px 12px", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, fontSize: 12, color: "#92400e", lineHeight: 1.45, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <Clock size={13} style={{ marginTop: 1, flexShrink: 0 }} />
              Booked by Alice after hours. Confirm to notify the customer and lock it in.
            </div>
          )}
          <p className="appt-detail">{appt.callerPhone ?? "—"}</p>
          {appt.callerEmail
            ? <p className="appt-detail">{appt.callerEmail}</p>
            : isPending && <p className="appt-detail" style={{ color: "#b45309" }}>No email on file — notify the customer manually</p>}
          <p className="appt-detail">{appt.serviceType ?? "Service not specified"}</p>
          <p className="appt-detail">{appt.address ?? "No address provided"}</p>
          {appt.notes && (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#475569", fontStyle: "italic", lineHeight: 1.45 }}>
              &ldquo;{appt.notes.length > 120 ? appt.notes.slice(0, 120) + "…" : appt.notes}&rdquo;
            </p>
          )}
        </div>

        <div className="appt-actions">
          {justConfirmed ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#15803d", fontWeight: 700, fontSize: 13 }}>
              ✓ Confirmation sent
            </div>
          ) : !isPast && !isConfirmed ? (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => sendConfirmation(appt)}
              style={{ fontSize: 13, ...(isPending ? { background: "#f59e0b", borderColor: "#f59e0b" } : {}) }}
            >
              {apptUpdating === appt.appointmentId + "_confirm" ? "Sending…" : isPending ? "Confirm & notify customer" : "Send Confirmation"}
            </button>
          ) : null}

          {appt.callerPhone && (
            <button
              className="button secondary"
              disabled={apptCalling === appt.appointmentId}
              onClick={() => callBackAppt(appt)}
              style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}
              title={`Call ${appt.callerPhone}`}
            >
              <Phone size={13} />
              {apptCalling === appt.appointmentId ? "Calling…" : "Call Back"}
            </button>
          )}
          <button className="button secondary" onClick={() => createJob(appt)} style={{ fontSize: 13 }}>
            Create Job
          </button>

          {!isPast && !isConfirmed && !justConfirmed && (
            <button className="button ghost" disabled={busy} onClick={() => updateApptStatus(appt, "confirmed")} style={{ fontSize: 12 }} title="Mark confirmed without emailing the customer">
              Confirm without email
            </button>
          )}
          {!isPast && appt.status !== "cancelled" && (
            <button className="button danger" disabled={busy} onClick={() => { if (confirm("Cancel this appointment?")) updateApptStatus(appt, "cancelled"); }} style={{ fontSize: 12 }}>
              Cancel
            </button>
          )}
        </div>
      </article>
    );
  }

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
          <p className="page-subtitle">Leads captured by Alice and upcoming inspection appointments.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {pendingCount > 0 && (
            <span className="status-pill" style={{ background: "#fffbeb", color: "#92400e", borderColor: "#fcd34d" }}>
              {pendingCount} to confirm
            </span>
          )}
          {newLeadsCount > 0 && (
            <span className="status-pill">{newLeadsCount} new leads</span>
          )}
        </div>
      </header>

      <div className="toolbar" style={{ marginBottom: 20 }}>
        <div className="segmented-control" aria-label="Pipeline view">
          <button
            className="segment"
            type="button"
            aria-pressed={tab === "leads"}
            onClick={() => setTab("leads")}
          >
            Leads{leads.length > 0 ? ` (${leads.length})` : ""}
          </button>
          <button
            className="segment"
            type="button"
            aria-pressed={tab === "appointments"}
            onClick={() => setTab("appointments")}
          >
            Appointments{appointments.length > 0 ? ` (${appointments.length})` : ""}
          </button>
        </div>
      </div>

      {tab === "leads" && (
        <>
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
                  <p style={{ color: "#888", fontSize: 14 }}>No leads in this category yet.</p>
                ) : (
                  <div className="queue-list">
                    {filteredLeads.map((lead) => (
                      <article
                        className="lead-card"
                        key={lead.leadId}
                        aria-selected={selectedLead?.leadId === lead.leadId}
                        onClick={() => setSelectedLead(lead)}
                        style={{ cursor: "pointer" }}
                      >
                        <div className="lead-title-row">
                          <div>
                            <p className="lead-name">{lead.callerName ?? "Unknown caller"}</p>
                            <p className="lead-phone">{lead.callerPhone ?? "—"}</p>
                          </div>
                          <StatusChip status={lead.urgency === "urgent" ? "urgent" : "normal"} />
                        </div>
                        <div className="lead-detail-grid">
                          <div className="detail-block">
                            <span className="detail-label">Service</span>
                            <span className="detail-value">{lead.serviceRequested ?? "—"}</span>
                          </div>
                          <div className="detail-block">
                            <span className="detail-label">Status</span>
                            <span className="detail-value">{lead.status}</span>
                          </div>
                          <div className="detail-block">
                            <span className="detail-label">Address</span>
                            <span className="detail-value">{lead.address ?? "—"}</span>
                          </div>
                        </div>
                        {lead.notes && (
                          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#475569", fontStyle: "italic", lineHeight: 1.4 }}>
                            &ldquo;{lead.notes.length > 100 ? lead.notes.slice(0, 100) + "…" : lead.notes}&rdquo;
                          </p>
                        )}
                        <p className="queue-meta">Captured {timeAgo(lead.createdAt)}</p>
                        <div className="lead-actions" onClick={(e) => e.stopPropagation()}>
                          {lead.callerPhone && (
                            <button
                              className="button small"
                              type="button"
                              disabled={leadCalling === lead.leadId}
                              onClick={() => callBackLead(lead)}
                              title={`Call ${lead.callerPhone}`}
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
                        <p className="lead-name">{selectedLead.callerName ?? "Unknown caller"}</p>
                        <p className="lead-phone">{selectedLead.callerPhone ?? "—"}</p>
                      </div>
                      <span className={selectedLead.urgency === "urgent" ? "tag urgent" : "tag"}>
                        {selectedLead.urgency}
                      </span>
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

                    <div className="lead-actions" style={{ marginTop: 18 }}>
                      <button
                        className="button primary"
                        type="button"
                        disabled={selectedLead.status === "contacted" || leadUpdating}
                        onClick={() => markContacted(selectedLead)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                      >
                        <Check size={14} strokeWidth={1.75} />
                        {selectedLead.status === "contacted" ? "Contacted" : "Mark contacted"}
                      </button>
                      {selectedLead.callerPhone && (
                        <button
                          className="button"
                          type="button"
                          disabled={leadCalling === selectedLead.leadId}
                          onClick={() => callBackLead(selectedLead)}
                          title={`Call ${selectedLead.callerPhone}`}
                          style={{ display: "flex", alignItems: "center", gap: 6 }}
                        >
                          <Phone size={13} />
                          {leadCalling === selectedLead.leadId ? "Calling…" : "Call Back"}
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

      {tab === "appointments" && (
        <>
          <section className="panel" aria-labelledby="upcoming-title">
            <div className="panel-header">
              <h2 className="panel-title" id="upcoming-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <CalendarDays size={16} strokeWidth={1.75} />
                Upcoming Inspections
              </h2>
            </div>
            <div className="panel-body">
              {upcomingAppts.length === 0 ? (
                <p style={{ color: "#888", fontSize: 14 }}>No upcoming appointments. They appear here when Alice books one.</p>
              ) : (
                <div style={{ display: "grid", gap: 16 }}>
                  {upcomingAppts.map((appt) => (
                    <AppointmentCard key={appt.appointmentId} appt={appt} />
                  ))}
                </div>
              )}
            </div>
          </section>

          {pastAppts.length > 0 && (
            <section className="panel" aria-labelledby="past-title" style={{ marginTop: 20 }}>
              <div className="panel-header">
                <h2 className="panel-title" id="past-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <History size={16} strokeWidth={1.75} />
                  Past &amp; Cancelled
                </h2>
              </div>
              <div className="panel-body">
                <div style={{ display: "grid", gap: 16 }}>
                  {pastAppts.map((appt) => (
                    <AppointmentCard key={appt.appointmentId} appt={appt} isPast />
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {leads.length === 0 && appointments.length === 0 && (
        <div style={{ padding: "48px 24px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
          No leads or appointments yet.{" "}
          <Link href={`/company/calls${previewSuffix}`} style={{ color: "var(--accent)" }}>
            View call history
          </Link>{" "}
          to see incoming activity.
        </div>
      )}
    </>
  );
}
