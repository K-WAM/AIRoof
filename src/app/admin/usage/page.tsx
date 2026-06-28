"use client";

import { useEffect, useState } from "react";

interface BizUsage {
  businessId: string;
  businessName: string;
  industry: string;
  active: boolean;
  vapiAssistantId: string | null;
  calls: number;
  leads: number;
  appointments: number;
}

export default function AdminUsagePage() {
  const [rows, setRows] = useState<BizUsage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/usage")
      .then((r) => r.json())
      .then((d) => setRows(d.businesses ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const totals = rows.reduce(
    (acc, r) => ({ calls: acc.calls + r.calls, leads: acc.leads + r.leads, appts: acc.appts + r.appointments }),
    { calls: 0, leads: 0, appts: 0 }
  );

  if (loading) return <div style={{ padding: 32, color: "#666" }}>Loading usage…</div>;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Usage</h1>
          <p className="page-subtitle">Platform-wide activity across all tenants.</p>
        </div>
      </header>

      <section className="metric-grid" aria-label="Platform totals" style={{ marginBottom: 24 }}>
        <article className="metric">
          <p className="metric-label">Active tenants</p>
          <p className="metric-value">{rows.filter((r) => r.active && r.vapiAssistantId).length}</p>
        </article>
        <article className="metric">
          <p className="metric-label">Total calls</p>
          <p className="metric-value">{totals.calls}</p>
        </article>
        <article className="metric">
          <p className="metric-label">Total leads</p>
          <p className="metric-value">{totals.leads}</p>
        </article>
        <article className="metric">
          <p className="metric-label">Appointments</p>
          <p className="metric-value">{totals.appts}</p>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Per-Business Activity</h2>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <p style={{ padding: 20, color: "#888", fontSize: 14 }}>No data yet.</p>
          ) : (
            <table className="business-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Industry</th>
                  <th>Vapi</th>
                  <th style={{ textAlign: "right" }}>Calls</th>
                  <th style={{ textAlign: "right" }}>Leads</th>
                  <th style={{ textAlign: "right" }}>Appts</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.businessId}>
                    <td>
                      <p className="business-name">{r.businessName}</p>
                      <p className="business-id">{r.businessId}</p>
                    </td>
                    <td style={{ textTransform: "capitalize" }}>{r.industry}</td>
                    <td>
                      {r.vapiAssistantId ? (
                        <span className="tag success">Active</span>
                      ) : (
                        <a href={`/admin/businesses/${r.businessId}/config`} className="tag urgent" style={{ textDecoration: "none" }} title="Set up this tenant's Vapi assistant">Not set — fix ↗</a>
                      )}
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.calls}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.leads}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.appointments}</td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <a
                        href={`/admin/businesses/${r.businessId}/config`}
                        className="button small"
                        style={{ fontSize: 12 }}
                      >
                        Configure
                      </a>
                      <a
                        href={`/company/dashboard?preview=${r.businessId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="button small"
                        style={{ fontSize: 12 }}
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
