"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query, orderBy, limit, doc, getDoc, getCountFromServer } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessTimezone } from "@/hooks/useBusinessTimezone";
import { StatusChip } from "@/components/ui/StatusChip";

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
}

interface JobSnapshot {
  jobId: string;
  title: string;
  clientName?: string;
  address?: string;
  status: string;
}

interface AgentSnapshot {
  agentName?: string;
  escalationPhone?: string;
  approvedServices?: string[];
  approvedFaqs?: Array<{ question: string; answer: string }>;
  active?: boolean;
  vapiAssistantId?: string;
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
  const tz = useBusinessTimezone();
  const searchParams = useSearchParams();
  const previewSuffix = searchParams?.get("preview") ? `?preview=${searchParams.get("preview")}` : "";

  const [callCount, setCallCount] = useState<number | null>(null);
  const [leads, setLeads] = useState<LeadSnapshot[]>([]);
  const [appointments, setAppointments] = useState<ApptSnapshot[]>([]);
  const [jobs, setJobs] = useState<JobSnapshot[]>([]);
  const [agent, setAgent] = useState<AgentSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !businessId) return;

    async function load() {
      try {
        const base = `businesses/${businessId}`;

        const [callCountSnap, leadsSnap, apptsSnap, bizDoc, jobsRes] = await Promise.all([
          getCountFromServer(collection(db!, base + "/calls")),
          getDocs(query(collection(db!, base + "/leads"), orderBy("createdAt", "desc"), limit(20))),
          getDocs(query(collection(db!, base + "/appointments"), orderBy("startTime", "asc"), limit(200))),
          getDoc(doc(db!, "businesses", businessId)),
          fetch(`/api/jobs?businessId=${businessId}`).then((r) => r.json()).catch(() => ({ jobs: [] })),
        ]);

        if (bizDoc.exists()) {
          const d = bizDoc.data()!;
          setAgent({
            agentName: d["agentName"],
            escalationPhone: d["escalationPhone"],
            approvedServices: d["approvedServices"],
            approvedFaqs: d["approvedFaqs"],
            active: d["active"],
            vapiAssistantId: d["vapiAssistantId"],
          });
        }

        setCallCount(callCountSnap.data().count);
        setLeads(leadsSnap.docs.map((d) => ({ leadId: d.id, ...d.data() } as LeadSnapshot)));
        setAppointments(apptsSnap.docs.map((d) => ({ appointmentId: d.id, ...d.data() } as ApptSnapshot)));
        setJobs((jobsRes.jobs ?? []) as JobSnapshot[]);
      } catch (err) {
        console.error("Dashboard load failed:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [businessId]);

  const urgentLeads = leads.filter((l) => l.urgency === "urgent" || l.urgency === "Urgent" || l.status === "new");
  const todayAppointments = appointments.filter((a) => isToday(a.startTime, tz) && a.status !== "cancelled");
  const activeJobs = jobs.filter((j) => j.status !== "complete");
  const isAgentActive = agent?.vapiAssistantId ? true : (agent?.active ?? false);

  const metrics = [
    { label: "Total calls", value: callCount ?? "—", href: `/company/calls${previewSuffix}` },
    { label: "Leads", value: leads.length, href: `/company/leads${previewSuffix}` },
    { label: "Urgent leads", value: urgentLeads.length, href: `/company/leads${previewSuffix ? previewSuffix + "&urgency=urgent" : "?urgency=urgent"}` },
    { label: "Appointments", value: appointments.length, href: `/company/appointments${previewSuffix}` },
  ];

  const agentSettings = agent
    ? [
        ["Agent name", agent.agentName ?? "Alice"],
        ["Status", isAgentActive ? "Active — answering calls" : "Inactive"],
        ["Escalation", agent.escalationPhone ?? "—"],
        ["Approved services", `${agent.approvedServices?.length ?? 0} configured`],
        ["Approved FAQs", `${agent.approvedFaqs?.length ?? 0} answers`],
        ["Calendar", "Scheduling enabled"],
      ]
    : [];

  const allClear = urgentLeads.length === 0 && todayAppointments.length === 0 && activeJobs.length === 0;

  if (loading) {
    return <div style={{ padding: 32, color: "#666" }}>Loading dashboard…</div>;
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Today&apos;s Work</h1>
          <p className="page-subtitle">
            Urgent leads, today&apos;s appointments, active jobs, and agent status.
          </p>
        </div>
        <span className="status-pill">{isAgentActive ? "Agent active" : "Agent inactive"}</span>
      </header>

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
          {urgentLeads.length > 0 && (
            <div className="feed-section">
              <div className="feed-section-header">
                <p className="feed-section-title">Needs Attention</p>
                <span className="feed-section-count">{urgentLeads.length}</span>
              </div>
              {urgentLeads.slice(0, 5).map((lead) => (
                <Link key={lead.leadId} href={`/company/leads${previewSuffix}`} className="feed-row">
                  <div className="feed-icon feed-icon--urgent">⚠</div>
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
                <Link key={appt.appointmentId} href={`/company/appointments${previewSuffix}`} className="feed-row">
                  <div className="feed-icon feed-icon--appt">◷</div>
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

          {activeJobs.length > 0 && (
            <div className="feed-section">
              <div className="feed-section-header">
                <p className="feed-section-title">Active Jobs</p>
                <span className="feed-section-count">{activeJobs.length}</span>
              </div>
              {activeJobs.slice(0, 5).map((job) => (
                <Link key={job.jobId} href={`/company/jobs/${job.jobId}${previewSuffix}`} className="feed-row">
                  <div className="feed-icon feed-icon--job">⚒</div>
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

          {allClear && (
            <div className="feed-empty">All caught up — nothing urgent right now.</div>
          )}
        </div>

        {/* Agent Setup panel - unchanged */}
        <aside className="panel" aria-labelledby="agent-title">
          <div className="panel-header">
            <h2 className="panel-title" id="agent-title">Agent Setup</h2>
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
