"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PageError } from "@/components/ui/PageError";
import { loadBusinesses, type BizRow } from "./loadBusinesses";
import { NewClientModal } from "./NewClientModal";
import { Building2, ExternalLink, Pencil, Plus } from "lucide-react";

function timeAgo(ms: number): string {
  const d = Math.floor((Date.now() - ms) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "1d ago";
  return `${d}d ago`;
}

export default function AdminBusinessesPage() {
  const [businesses, setBusinesses] = useState<BizRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);

  function reload() {
    void loadBusinesses().then((result) => {
      if (result.status === "error") {
        setLoadError(true);
      } else {
        setBusinesses(result.businesses);
        setLoadError(false);
      }
      setLoading(false);
    });
  }

  useEffect(() => { reload(); }, []);

  const active = businesses.filter((b) => b.active && b.vapiAssistantId);
  const needsSetup = businesses.filter((b) => !b.vapiAssistantId);

  if (loading) return <PageSkeleton rows={6} />;
  if (loadError) {
    return (
      <PageError
        message="Businesses could not be loaded. No tenant data is being shown."
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Building2 size={20} strokeWidth={1.75} />
            Clients
          </h1>
          <p className="page-subtitle">
            All tenants on the platform. Click Edit to configure an agent, Preview to see the client view.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", alignSelf: "flex-start" }}>
          <Link href="/hub/onboarding" className="button" style={{ fontSize: 13 }}>
            Advanced setup
          </Link>
          <button
            type="button"
            className="button primary"
            onClick={() => setNewClientOpen(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Plus size={15} strokeWidth={1.75} />
            + Client
          </button>
        </div>
      </header>

      <NewClientModal
        open={newClientOpen}
        onClose={() => setNewClientOpen(false)}
        onCreated={reload}
      />

      <section className="metric-grid" aria-label="Business summary" style={{ marginBottom: 24 }}>
        <article className="metric">
          <p className="metric-label">Total</p>
          <p className="metric-value">{businesses.length}</p>
        </article>
        <article className="metric">
          <p className="metric-label">Vapi active</p>
          <p className="metric-value">{active.length}</p>
        </article>
        <article className="metric">
          <p className="metric-label">Needs Vapi</p>
          <p className="metric-value">{needsSetup.length}</p>
        </article>
        <article className="metric">
          <p className="metric-label">Industries</p>
          <p className="metric-value">{new Set(businesses.map((b) => b.industry)).size}</p>
        </article>
      </section>

      <section className="panel" aria-labelledby="biz-list-title">
        <div className="panel-header">
          <h2 className="panel-title" id="biz-list-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Building2 size={16} strokeWidth={1.75} />
            All Clients
          </h2>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {businesses.length === 0 ? (
            <p style={{ padding: 20, color: "#888", fontSize: 14 }}>
              No clients yet. Click &ldquo;+ Client&rdquo; to onboard your first one.
            </p>
          ) : (
            <table className="business-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Industry</th>
                  <th>Vapi assistant</th>
                  <th>Notification email</th>
                  <th>Status</th>
                  <th>Added</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((b) => (
                  <tr
                    key={b.businessId}
                    onClick={() => { window.location.href = `/admin/businesses/${b.businessId}/config`; }}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "#f8fafc"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                  >
                    <td>
                      <p className="business-name">{b.businessName}</p>
                      <p className="business-id">{b.businessId}</p>
                    </td>
                    <td style={{ textTransform: "capitalize" }}>{b.industry}</td>
                    <td>
                      {b.vapiAssistantId ? (
                        <span className="tag success" style={{ fontFamily: "monospace", fontSize: 11 }}>
                          {b.vapiAssistantId.slice(0, 8)}…
                        </span>
                      ) : (
                        <span className="tag urgent">Not set</span>
                      )}
                    </td>
                    <td style={{ fontSize: 13, color: "#64748b" }}>{b.notificationEmail ?? "—"}</td>
                    <td>
                      <span className={b.active ? "tag success" : "tag"}>
                        {b.active ? "Active" : "Inactive"}
                      </span>
                      {b.subscriptionStatus === "paused" && (
                        <span className="tag urgent" style={{ marginLeft: 6 }}>Paused</span>
                      )}
                    </td>
                    <td style={{ fontSize: 13, color: "#94a3b8" }}>{timeAgo(b.createdAt)}</td>
                    <td style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={`/admin/businesses/${b.businessId}/config`}
                        className="button"
                        style={{ fontSize: 12, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 5 }}
                      >
                        <Pencil size={13} strokeWidth={1.75} />
                        Edit
                      </Link>
                      <a
                        href={`/company/dashboard?preview=${b.businessId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="button"
                        style={{ fontSize: 12, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 5 }}
                      >
                        <ExternalLink size={13} strokeWidth={1.75} />
                        Preview
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
