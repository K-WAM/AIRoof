"use client";

import { useEffect, useState } from "react";

interface BizRow {
  businessId: string;
  businessName: string;
  industry: string;
  active: boolean;
  vapiAssistantId?: string;
  contactPhone?: string;
  notificationEmail?: string;
  serviceArea?: string[];
  createdAt: number;
}

function timeAgo(ms: number): string {
  const d = Math.floor((Date.now() - ms) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "1d ago";
  return `${d}d ago`;
}

export default function AdminBusinessesPage() {
  const [businesses, setBusinesses] = useState<BizRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/businesses")
      .then((r) => r.json())
      .then((data) => {
        const rows = (data.businesses ?? []).map(
          (b: { business: BizRow }) => b.business
        );
        setBusinesses(rows);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const active = businesses.filter((b) => b.active && b.vapiAssistantId);
  const needsSetup = businesses.filter((b) => !b.vapiAssistantId);

  if (loading) return <div style={{ padding: 32, color: "#666" }}>Loading businesses…</div>;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Businesses</h1>
          <p className="page-subtitle">
            All tenants on the platform. Click Edit to configure an agent, Preview to see the client view.
          </p>
        </div>
      </header>

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
          <h2 className="panel-title" id="biz-list-title">All Companies</h2>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {businesses.length === 0 ? (
            <p style={{ padding: 20, color: "#888", fontSize: 14 }}>
              No businesses yet. Click &ldquo;Add business&rdquo; to onboard your first client.
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
                  <tr key={b.businessId}>
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
                    </td>
                    <td style={{ fontSize: 13, color: "#94a3b8" }}>{timeAgo(b.createdAt)}</td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <a
                        href={`/admin/businesses/${b.businessId}/config`}
                        className="button"
                        style={{ fontSize: 12, padding: "4px 10px" }}
                      >
                        Edit
                      </a>
                      <a
                        href={`/company/dashboard?preview=${b.businessId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="button"
                        style={{ fontSize: 12, padding: "4px 10px" }}
                      >
                        Preview ↗
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
