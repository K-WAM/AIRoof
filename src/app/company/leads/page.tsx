"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";
import { StatusChip } from "@/components/ui/StatusChip";

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

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function CompanyLeadsPage() {
  const businessId = useBusinessId();
  const searchParams = useSearchParams();
  const initialFilter = (searchParams?.get("urgency") === "urgent" ? "urgent" : "all") as "all" | "urgent" | "new" | "contacted";

  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [filter, setFilter] = useState<"all" | "urgent" | "new" | "contacted">(initialFilter);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [calling, setCalling] = useState<string | null>(null); // leadId being called

  useEffect(() => {
    if (!db || !businessId) return;
    getDocs(query(collection(db, `businesses/${businessId}/leads`), orderBy("createdAt", "desc")))
      .then((snap) => {
        const data = snap.docs.map((d) => ({ leadId: d.id, ...d.data() } as Lead));
        setLeads(data);
        if (data.length > 0) setSelected(data[0]);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [businessId]);

  async function callBack(lead: Lead) {
    if (!lead.callerPhone) return;
    setCalling(lead.leadId);
    try {
      const res = await fetch("/api/calls/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPhone: lead.callerPhone, leadId: lead.leadId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        alert(`Call failed: ${err.error ?? "Unknown error"}`);
      }
    } catch {
      alert("Network error — could not initiate call.");
    } finally {
      setCalling(null);
    }
  }

  async function markContacted(lead: Lead) {
    if (!db) return;
    setUpdating(true);
    try {
      await updateDoc(doc(db, `businesses/${businessId}/leads`, lead.leadId), {
        status: "contacted",
        updatedAt: Date.now(),
      });
      setLeads((prev) =>
        prev.map((l) => (l.leadId === lead.leadId ? { ...l, status: "contacted" } : l))
      );
      if (selected?.leadId === lead.leadId) setSelected({ ...lead, status: "contacted" });
    } finally {
      setUpdating(false);
    }
  }

  const filtered = leads.filter((l) => {
    if (filter === "urgent") return l.urgency === "urgent";
    if (filter === "new") return l.status === "new";
    if (filter === "contacted") return l.status === "contacted";
    return true;
  });

  const needsReview = leads.filter((l) => l.status === "new").length;

  if (loading) return <div style={{ padding: 32, color: "#666" }}>Loading leads…</div>;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="page-subtitle">
            Triage captured roofing calls, prioritize urgent leaks, and move
            qualified homeowners into callbacks or inspections.
          </p>
        </div>
        <span className="status-pill">{needsReview} need review</span>
      </header>

      <div className="toolbar">
        <div className="segmented-control" aria-label="Lead status filter">
          {(["all", "urgent", "new", "contacted"] as const).map((f) => (
            <button
              key={f}
              className="segment"
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="lead-workspace">
        <section className="panel" aria-labelledby="lead-queue-title">
          <div className="panel-header">
            <h2 className="panel-title" id="lead-queue-title">Follow-up Queue</h2>
          </div>
          <div className="panel-body">
            {filtered.length === 0 ? (
              <p style={{ color: "#888", fontSize: 14 }}>No leads in this category yet.</p>
            ) : (
              <div className="queue-list">
                {filtered.map((lead) => (
                  <article
                    className="lead-card"
                    key={lead.leadId}
                    aria-selected={selected?.leadId === lead.leadId}
                    onClick={() => setSelected(lead)}
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
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="panel" aria-labelledby="selected-lead-title">
          <div className="panel-header">
            <h2 className="panel-title" id="selected-lead-title">Lead Detail</h2>
          </div>
          <div className="panel-body">
            {!selected ? (
              <p style={{ color: "#888", fontSize: 14 }}>Select a lead to view details.</p>
            ) : (
              <>
                <div className="lead-title-row">
                  <div>
                    <p className="lead-name">{selected.callerName ?? "Unknown caller"}</p>
                    <p className="lead-phone">{selected.callerPhone ?? "—"}</p>
                  </div>
                  <span className={selected.urgency === "urgent" ? "tag urgent" : "tag"}>
                    {selected.urgency}
                  </span>
                </div>

                <div className="lead-detail-grid" style={{ marginTop: 16 }}>
                  <div className="detail-block">
                    <span className="detail-label">Service</span>
                    <span className="detail-value">{selected.serviceRequested ?? "—"}</span>
                  </div>
                  <div className="detail-block">
                    <span className="detail-label">Status</span>
                    <span className="detail-value"><StatusChip status={selected.status} /></span>
                  </div>
                  <div className="detail-block">
                    <span className="detail-label">Address</span>
                    <span className="detail-value">{selected.address ?? "—"}</span>
                  </div>
                  <div className="detail-block">
                    <span className="detail-label">Captured</span>
                    <span className="detail-value">{timeAgo(selected.createdAt)}</span>
                  </div>
                </div>

                {selected.notes && (
                  <p style={{ marginTop: 12, fontSize: 14, color: "#444" }}>{selected.notes}</p>
                )}

                <div className="lead-actions" style={{ marginTop: 18 }}>
                  <button
                    className="button primary"
                    type="button"
                    disabled={selected.status === "contacted" || updating}
                    onClick={() => markContacted(selected)}
                  >
                    {selected.status === "contacted" ? "Contacted" : "Mark contacted"}
                  </button>
                  {selected.callerPhone && (
                    <button
                      className="button"
                      type="button"
                      disabled={calling === selected.leadId}
                      onClick={() => callBack(selected)}
                      title={`Call ${selected.callerPhone}`}
                    >
                      {calling === selected.leadId ? "Calling…" : "☎ Call Back"}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
