"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, limit, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/contexts/AuthContext";

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

interface AgentSnapshot {
  agentName?: string;
  escalationPhone?: string;
  approvedServices?: string[];
  approvedFaqs?: Array<{ question: string; answer: string }>;
  greeting?: string;
  active?: boolean;
}

export default function CompanyDashboardPage() {
  const { user } = useAuth();
  const businessId = user?.businessId ?? "demo-roofing";

  const [callCount, setCallCount] = useState<number | null>(null);
  const [leads, setLeads] = useState<LeadSnapshot[]>([]);
  const [apptCount, setApptCount] = useState<number | null>(null);
  const [agent, setAgent] = useState<AgentSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !businessId) return;

    async function load() {
      try {
        const base = `businesses/${businessId}`;

        const [callsSnap, leadsSnap, apptsSnap, bizDoc] = await Promise.all([
          getDocs(collection(db!, base + "/calls")),
          getDocs(query(collection(db!, base + "/leads"), orderBy("createdAt", "desc"), limit(5))),
          getDocs(collection(db!, base + "/appointments")),
          getDoc(doc(db!, "businesses", businessId)),
        ]);
        if (bizDoc.exists()) {
          const d = bizDoc.data()!;
          setAgent({
            agentName: d["agentName"],
            escalationPhone: d["escalationPhone"],
            approvedServices: d["approvedServices"],
            approvedFaqs: d["approvedFaqs"],
            greeting: d["greeting"],
            active: d["active"],
          });
        }

        setCallCount(callsSnap.size);
        setLeads(leadsSnap.docs.map((d) => ({ leadId: d.id, ...d.data() } as LeadSnapshot)));
        setApptCount(apptsSnap.size);
      } catch (err) {
        console.error("Dashboard load failed:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [businessId]);

  const urgentLeads = leads.filter((l) => l.urgency === "urgent" || l.urgency === "Urgent");

  const metrics = [
    { label: "Total calls", value: callCount ?? "—" },
    { label: "Recent leads", value: leads.length },
    { label: "Urgent leads", value: urgentLeads.length },
    { label: "Appointments", value: apptCount ?? "—" },
  ];

  const agentSettings = agent
    ? [
        ["Agent name", agent.agentName ?? "Roofus"],
        ["Status", agent.active ? "Active" : "Inactive"],
        ["Escalation", agent.escalationPhone ?? "—"],
        ["Approved services", `${agent.approvedServices?.length ?? 0} configured`],
        ["Approved FAQs", `${agent.approvedFaqs?.length ?? 0} answers`],
        ["Calendar", "Mock scheduling"],
      ]
    : [];

  if (loading) {
    return (
      <div style={{ padding: 32, color: "#666" }}>Loading dashboard…</div>
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Today&apos;s Work</h1>
          <p className="page-subtitle">
            Review captured calls, urgent roofing leads, appointment requests,
            and the agent settings that affect this company.
          </p>
        </div>
        <span className="status-pill">{agent?.active ? "Agent active" : "Agent inactive"}</span>
      </header>

      <section className="metric-grid" aria-label="Summary">
        {metrics.map((metric) => (
          <article className="metric" key={metric.label}>
            <p className="metric-label">{metric.label}</p>
            <p className="metric-value">{metric.value}</p>
          </article>
        ))}
      </section>

      <div className="ops-grid">
        <section className="panel" aria-labelledby="queue-title">
          <div className="panel-header">
            <h2 className="panel-title" id="queue-title">Recent Leads</h2>
          </div>
          <div className="panel-body">
            {leads.length === 0 ? (
              <p style={{ color: "#888", fontSize: 14 }}>No leads yet. Leads appear here after calls come in.</p>
            ) : (
              <div className="queue-list">
                {leads.map((lead) => (
                  <article className="queue-item" key={lead.leadId}>
                    <div className="queue-topline">
                      <p className="queue-title">{lead.callerName ?? lead.callerPhone ?? "Unknown caller"}</p>
                      <span className={lead.urgency === "urgent" ? "tag urgent" : "tag"}>
                        {lead.urgency}
                      </span>
                    </div>
                    <p className="queue-meta">{lead.serviceRequested ?? "Service not specified"}</p>
                    <p className="queue-meta">{lead.address ?? "No address"} · {lead.status}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

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
