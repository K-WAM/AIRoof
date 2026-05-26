"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";
import type { Job, FieldUpdate, InvoiceLineItem } from "@/types/jobs";

interface Invoice {
  lineItems: InvoiceLineItem[];
  subtotal: number;
  clientName?: string | null;
  clientPhone?: string | null;
  address?: string | null;
  serviceType?: string | null;
  generatedAt: number;
}

const SEVERITY_COLOR: Record<string, string> = {
  high: "#b91c1c",
  medium: "#d97706",
  low: "#15803d",
};

export default function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const searchParams = useSearchParams();
  const hookBusinessId = useBusinessId();
  const businessId = searchParams?.get("businessId") ?? hookBusinessId;
  const preview = searchParams?.get("preview");
  const previewSuffix = preview ? `?preview=${preview}` : "";

  const [job, setJob] = useState<Job | null>(null);
  const [updates, setUpdates] = useState<FieldUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"timeline" | "materials" | "labor" | "issues" | "invoice" | "notes">("timeline");
  const [report, setReport] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [editableInvoice, setEditableInvoice] = useState<InvoiceLineItem[]>([]);

  const load = useCallback(async () => {
    if (!businessId) return;
    const [jobRes, updatesRes] = await Promise.all([
      fetch(`/api/jobs?businessId=${businessId}`).then((r) => r.json()),
      fetch(`/api/jobs/${jobId}/updates?businessId=${businessId}`).then((r) => r.json()),
    ]);
    const found = (jobRes.jobs as Job[]).find((j) => j.jobId === jobId) ?? null;
    setJob(found);
    setUpdates(updatesRes.updates ?? []);
    setLoading(false);
  }, [businessId, jobId]);

  useEffect(() => { load(); }, [load]);

  async function generateReport() {
    setGeneratingReport(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      const data = await res.json();
      setReport(data.report ?? "");
      setActiveTab("notes");
    } finally {
      setGeneratingReport(false);
    }
  }

  async function generateInvoice() {
    setGeneratingInvoice(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      const data = await res.json();
      setInvoice(data.invoice ?? null);
      setEditableInvoice(data.invoice?.lineItems ?? []);
      setActiveTab("invoice");
    } finally {
      setGeneratingInvoice(false);
    }
  }

  function updateLineItem(index: number, field: keyof InvoiceLineItem, value: string) {
    setEditableInvoice((prev) => {
      const next = [...prev];
      const item = { ...next[index] };
      if (field === "description") {
        item.description = value;
      } else {
        const n = parseFloat(value) || 0;
        (item as Record<string, unknown>)[field] = n;
        item.total = item.quantity * item.unitPrice;
      }
      next[index] = item;
      return next;
    });
  }

  if (loading) return <div style={{ padding: 32, color: "#666" }}>Loading job…</div>;
  if (!job) return <div style={{ padding: 32, color: "#b91c1c" }}>Job not found.</div>;

  const allParsed = updates.map((u) => u.parsed).filter(Boolean);
  const timeline = allParsed.flatMap((p) => p!.timeline);
  const materials = allParsed.flatMap((p) => p!.materials);
  const labor = allParsed.flatMap((p) => p!.labor);
  const issues = allParsed.flatMap((p) => p!.issues);
  const invoiceTotal = editableInvoice.reduce((s, li) => s + li.total, 0);

  const TABS = [
    { id: "timeline", label: `Timeline (${timeline.length})` },
    { id: "materials", label: `Materials (${materials.length})` },
    { id: "labor", label: `Labor (${labor.length})` },
    { id: "issues", label: `Issues (${issues.length})` },
    { id: "invoice", label: "Invoice" },
    { id: "notes", label: "Report" },
  ] as const;

  return (
    <>
      <header className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <a href={`/company/jobs${previewSuffix}`} style={{ color: "#64748b", fontSize: 13 }}>← Jobs</a>
            <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 18, color: "#1e293b" }}>{jobId}</span>
          </div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>{job.title}</h1>
          {job.address && <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>{job.address}</p>}
          {job.clientName && <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>{job.clientName}{job.clientPhone ? ` · ${job.clientPhone}` : ""}</p>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a
            href={`/company/field?jobId=${jobId}${preview ? `&preview=${preview}` : ""}`}
            className="button"
          >
            Field view ↗
          </a>
          <button className="button" onClick={generateReport} disabled={generatingReport || generatingInvoice || updates.length === 0}>
            {generatingReport ? "⏳ Generating…" : "Generate Report"}
          </button>
          <button className="button primary" onClick={generateInvoice} disabled={generatingReport || generatingInvoice || updates.length === 0}>
            {generatingInvoice ? "⏳ Generating…" : "Generate Invoice"}
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid #e2e8f0" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
              fontWeight: activeTab === tab.id ? 700 : 400,
              color: activeTab === tab.id ? "#2563eb" : "#64748b",
              borderBottom: activeTab === tab.id ? "2px solid #2563eb" : "2px solid transparent",
              marginBottom: -2, fontSize: 13,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "timeline" && (
        <section className="panel">
          <div className="panel-body">
            {timeline.length === 0 ? (
              <div style={{ color: "#888", fontSize: 14 }}>
                <p style={{ margin: "0 0 8px" }}>No timeline events yet.</p>
                <a href={`/company/field?jobId=${jobId}${preview ? `&preview=${preview}` : ""}`} className="button" style={{ fontSize: 12 }}>Submit a field update ↗</a>
              </div>
            ) : (
              <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
                {timeline.map((t, i) => (
                  <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span style={{ minWidth: 24, height: 24, borderRadius: "50%", background: "#e0e7ff", color: "#3730a3", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                    <div>
                      {t.time && <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, display: "block" }}>{t.time}</span>}
                      <span style={{ fontSize: 14 }}>{t.description}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      )}

      {activeTab === "materials" && (
        <section className="panel">
          <div className="panel-body" style={{ padding: 0 }}>
            {materials.length === 0 ? (
              <div style={{ color: "#888", fontSize: 14, padding: 20 }}>
                <p style={{ margin: "0 0 8px" }}>No materials extracted yet.</p>
                <a href={`/company/field?jobId=${jobId}${preview ? `&preview=${preview}` : ""}`} className="button" style={{ fontSize: 12 }}>Submit a field update ↗</a>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Item</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Qty</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Unit</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "#64748b" }}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 16px" }}>{m.item}</td>
                      <td style={{ padding: "10px 16px", color: "#64748b" }}>{m.quantity ?? "—"}</td>
                      <td style={{ padding: "10px 16px", color: "#64748b" }}>{m.unit ?? "—"}</td>
                      <td style={{ padding: "10px 16px", textAlign: "right", color: "#64748b" }}>
                        {m.cost != null ? `$${m.cost.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {activeTab === "labor" && (
        <section className="panel">
          <div className="panel-body" style={{ padding: 0 }}>
            {labor.length === 0 ? (
              <div style={{ color: "#888", fontSize: 14, padding: 20 }}>
                <p style={{ margin: "0 0 8px" }}>No labor extracted yet.</p>
                <a href={`/company/field?jobId=${jobId}${preview ? `&preview=${preview}` : ""}`} className="button" style={{ fontSize: 12 }}>Submit a field update ↗</a>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Description</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "#64748b" }}>Hours</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "#64748b" }}>Rate/hr</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "#64748b" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {labor.map((l, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 16px" }}>{l.description}</td>
                      <td style={{ padding: "10px 16px", textAlign: "right", color: "#64748b" }}>{l.hours ?? "—"}</td>
                      <td style={{ padding: "10px 16px", textAlign: "right", color: "#64748b" }}>
                        {l.rate != null ? `$${l.rate}/hr` : "—"}
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600 }}>
                        {l.hours != null && l.rate != null ? `$${(l.hours * l.rate).toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {activeTab === "issues" && (
        <section className="panel">
          <div className="panel-body">
            {issues.length === 0 ? (
              <div style={{ color: "#888", fontSize: 14 }}>
                <p style={{ margin: "0 0 8px" }}>No issues extracted yet.</p>
                <a href={`/company/field?jobId=${jobId}${preview ? `&preview=${preview}` : ""}`} className="button" style={{ fontSize: 12 }}>Submit a field update ↗</a>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {issues.map((issue, i) => (
                  <div key={i} style={{
                    padding: "12px 16px", borderRadius: 8,
                    background: SEVERITY_COLOR[issue.severity] + "10",
                    borderLeft: `3px solid ${SEVERITY_COLOR[issue.severity]}`,
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: SEVERITY_COLOR[issue.severity], textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {issue.severity}
                    </span>
                    <p style={{ margin: "4px 0 0", fontSize: 14 }}>{issue.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === "invoice" && (
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Draft Invoice</h2>
            {invoice && (
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                Generated {new Date(invoice.generatedAt).toLocaleString("en-US")}
              </span>
            )}
          </div>
          <div className="panel-body">
            {!invoice ? (
              <p style={{ color: "#888", fontSize: 14 }}>
                Click &quot;Generate Invoice&quot; above to produce a draft invoice from field updates.
              </p>
            ) : (
              <>
                <div style={{ marginBottom: 16, fontSize: 13, color: "#64748b" }}>
                  {invoice.clientName && <div><strong>Client:</strong> {invoice.clientName}</div>}
                  {invoice.address && <div><strong>Address:</strong> {invoice.address}</div>}
                  {invoice.serviceType && <div><strong>Service:</strong> {invoice.serviceType}</div>}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                      <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Description</th>
                      <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "#64748b" }}>Qty</th>
                      <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "#64748b" }}>Unit Price</th>
                      <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "#64748b" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editableInvoice.map((li, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "8px 16px" }}>
                          <input
                            value={li.description}
                            onChange={(e) => updateLineItem(i, "description", e.target.value)}
                            style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 13 }}
                          />
                        </td>
                        <td style={{ padding: "8px 16px" }}>
                          <input
                            type="number"
                            value={li.quantity}
                            onChange={(e) => updateLineItem(i, "quantity", e.target.value)}
                            style={{ width: 60, border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 13, textAlign: "right" }}
                          />
                        </td>
                        <td style={{ padding: "8px 16px" }}>
                          <input
                            type="number"
                            value={li.unitPrice}
                            onChange={(e) => updateLineItem(i, "unitPrice", e.target.value)}
                            style={{ width: 80, border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 13, textAlign: "right" }}
                          />
                        </td>
                        <td style={{ padding: "8px 16px", textAlign: "right", fontWeight: 600 }}>
                          ${li.total.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc" }}>
                      <td colSpan={3} style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700 }}>Subtotal</td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, fontSize: 16 }}>
                        ${invoiceTotal.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 12 }}>
                  This is a draft. Edit line items above before sending to client.
                </p>
              </>
            )}
          </div>
        </section>
      )}

      {activeTab === "notes" && (
        <section className="panel">
          <div className="panel-body">
            {!report ? (
              <p style={{ color: "#888", fontSize: 14 }}>
                Click &quot;Generate Report&quot; above to produce a text report from field updates.
              </p>
            ) : (
              <pre style={{ fontFamily: "monospace", fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.7, color: "#1e293b" }}>
                {report}
              </pre>
            )}
          </div>
        </section>
      )}

      {/* Raw field updates list */}
      <section className="panel" style={{ marginTop: 20 }}>
        <div className="panel-header">
          <h2 className="panel-title">Field Updates ({updates.length})</h2>
          <a
            className="button"
            href={`/company/field?jobId=${jobId}${preview ? `&preview=${preview}` : ""}`}
            style={{ fontSize: 12 }}
          >
            Submit update ↗
          </a>
        </div>
        <div className="panel-body">
          {updates.length === 0 ? (
            <p style={{ color: "#888", fontSize: 14 }}>No field updates yet. Send workers to the field view to submit voice or text updates.</p>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {updates.map((u, i) => (
                <div key={u.updateId} style={{ padding: "12px 16px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Update {i + 1}</span>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>
                      {new Date(u.createdAt).toLocaleString("en-US")}
                      {u.submittedBy ? ` · ${u.submittedBy}` : ""}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 14, color: "#334155" }}>{u.rawText}</p>
                  {u.parseError && (
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "#b91c1c" }}>Parse failed: {u.parseError}</p>
                  )}
                  {u.parsed && (
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "#15803d" }}>
                      ✓ Parsed: {u.parsed.timeline.length} events, {u.parsed.materials.length} materials, {u.parsed.issues.length} issues
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
