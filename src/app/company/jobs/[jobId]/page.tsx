"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";
import type { Job, FieldUpdate, ParsedUpdate } from "@/types/jobs";

const SEVERITY_COLOR: Record<string, string> = {
  high: "#b91c1c",
  medium: "#d97706",
  low: "#15803d",
};

type LaborRow = { name: string; arrival: string; departure: string; hours: string; rate: string };
type MaterialRow = { item: string; quantity: string; unit: string; unitPrice: string };
type OtherRow = { description: string; amount: string };

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
  const [activeTab, setActiveTab] = useState<"timeline" | "materials" | "labor" | "issues" | "invoice" | "report">("timeline");

  // Invoice state
  const [invoiceReady, setInvoiceReady] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [laborRows, setLaborRows] = useState<LaborRow[]>([]);
  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([]);
  const [otherRows, setOtherRows] = useState<OtherRow[]>([]);
  const [taxRate, setTaxRate] = useState("0");
  const [invoiceNotes, setInvoiceNotes] = useState("Net 30. Payment due within 30 days of invoice date.");

  // Report state
  const [report, setReport] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      const [jobRes, updatesRes] = await Promise.all([
        fetch(`/api/jobs?businessId=${businessId}`).then((r) => r.json()),
        fetch(`/api/jobs/${jobId}/updates?businessId=${businessId}`).then((r) => r.json()),
      ]);
      const found = (jobRes.jobs as Job[]).find((j) => j.jobId === jobId) ?? null;
      setJob(found);
      setUpdates(updatesRes.updates ?? []);
    } catch {
      // silently fail — show not found below
    }
    setLoading(false);
  }, [businessId, jobId]);

  useEffect(() => { load(); }, [load]);

  const allParsed = updates.map((u) => u.parsed).filter(Boolean) as ParsedUpdate[];
  const timeline = allParsed.flatMap((p) => p.timeline);
  const materials = allParsed.flatMap((p) => p.materials);
  const labor = allParsed.flatMap((p) => p.labor);
  const issues = allParsed.flatMap((p) => p.issues);

  async function generateInvoice() {
    setGeneratingInvoice(true);
    setInvoiceError(null);
    try {
      // Build labor rows from parsed labor data
      const newLaborRows: LaborRow[] = labor.map((l) => ({
        name: l.description,
        arrival: l.arrivalTime ?? "",
        departure: l.departureTime ?? "",
        hours: l.hours != null ? String(l.hours) : "",
        rate: l.rate != null ? String(l.rate) : "65",
      }));
      if (newLaborRows.length === 0) {
        newLaborRows.push({ name: "", arrival: "", departure: "", hours: "", rate: "65" });
      }

      // Build material rows
      const newMaterialRows: MaterialRow[] = materials.map((m) => ({
        item: m.item,
        quantity: m.quantity ?? "1",
        unit: m.unit ?? "",
        unitPrice: m.cost != null && m.quantity
          ? String((m.cost / (parseFloat(m.quantity) || 1)).toFixed(2))
          : "",
      }));

      setLaborRows(newLaborRows);
      setMaterialRows(newMaterialRows);
      setOtherRows([]);
      setInvoiceReady(true);
      setActiveTab("invoice");
    } catch (e) {
      setInvoiceError(e instanceof Error ? e.message : "Failed to generate invoice");
    } finally {
      setGeneratingInvoice(false);
    }
  }

  async function generateReport() {
    setGeneratingReport(true);
    setReportError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Server error");
      setReport(data.report ?? "");
      setActiveTab("report");
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "Failed to generate report");
    } finally {
      setGeneratingReport(false);
    }
  }

  // Invoice math
  function laborTotal(row: LaborRow) {
    const h = parseFloat(row.hours) || 0;
    const r = parseFloat(row.rate) || 0;
    return h * r;
  }
  function materialTotal(row: MaterialRow) {
    const q = parseFloat(row.quantity) || 0;
    const p = parseFloat(row.unitPrice) || 0;
    return q * p;
  }
  const laborSubtotal = laborRows.reduce((s, r) => s + laborTotal(r), 0);
  const materialSubtotal = materialRows.reduce((s, r) => s + materialTotal(r), 0);
  const otherSubtotal = otherRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const subtotal = laborSubtotal + materialSubtotal + otherSubtotal;
  const tax = subtotal * (parseFloat(taxRate) || 0) / 100;
  const grandTotal = subtotal + tax;

  const TABS = [
    { id: "timeline", label: `Timeline (${timeline.length})` },
    { id: "materials", label: `Materials (${materials.length})` },
    { id: "labor", label: `Labor (${labor.length})` },
    { id: "issues", label: `Issues (${issues.length})` },
    { id: "invoice", label: "Invoice" },
    { id: "report", label: "Report" },
  ] as const;

  if (loading) return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 13, color: "#64748b" }}>Loading job…</div>
    </div>
  );
  if (!job) return <div style={{ padding: 32, color: "#b91c1c" }}>Job not found.</div>;

  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const due = new Date(Date.now() + 30 * 86400000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white; }
          .panel { box-shadow: none; border: none; }
        }
      `}</style>

      <header className="page-header no-print">
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
          <a href={`/company/field?jobId=${jobId}${preview ? `&preview=${preview}` : ""}`} className="button">Field view ↗</a>
          <button className="button" onClick={generateReport} disabled={generatingReport || generatingInvoice || updates.length === 0}>
            {generatingReport ? "⏳ Generating…" : "Generate Report"}
          </button>
          <button className="button primary" onClick={generateInvoice} disabled={generatingReport || generatingInvoice || updates.length === 0}>
            {generatingInvoice ? "⏳ Generating…" : "Generate Invoice"}
          </button>
        </div>
      </header>

      {(reportError || invoiceError) && (
        <div style={{ padding: "10px 16px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, marginBottom: 12, color: "#b91c1c", fontSize: 13 }} className="no-print">
          {reportError || invoiceError}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid #e2e8f0" }} className="no-print">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
            fontWeight: activeTab === tab.id ? 700 : 400,
            color: activeTab === tab.id ? "#2563eb" : "#64748b",
            borderBottom: activeTab === tab.id ? "2px solid #2563eb" : "2px solid transparent",
            marginBottom: -2, fontSize: 13,
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Timeline ── */}
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

      {/* ── Materials ── */}
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
                      <td style={{ padding: "10px 16px", textAlign: "right", color: "#64748b" }}>{m.cost != null ? `$${m.cost.toFixed(2)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {/* ── Labor ── */}
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
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Technician</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Arrival</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Departure</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "#64748b" }}>Hours</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "#64748b" }}>Rate/hr</th>
                  </tr>
                </thead>
                <tbody>
                  {labor.map((l, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 16px", fontWeight: 600 }}>{l.description}</td>
                      <td style={{ padding: "10px 16px", color: "#64748b" }}>{l.arrivalTime ?? "—"}</td>
                      <td style={{ padding: "10px 16px", color: "#64748b" }}>{l.departureTime ?? "—"}</td>
                      <td style={{ padding: "10px 16px", textAlign: "right", color: "#64748b" }}>{l.hours ?? "—"}</td>
                      <td style={{ padding: "10px 16px", textAlign: "right", color: "#64748b" }}>{l.rate != null ? `$${l.rate}/hr` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {/* ── Issues ── */}
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
                  <div key={i} style={{ padding: "12px 16px", borderRadius: 8, background: SEVERITY_COLOR[issue.severity] + "10", borderLeft: `3px solid ${SEVERITY_COLOR[issue.severity]}` }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: SEVERITY_COLOR[issue.severity], textTransform: "uppercase", letterSpacing: "0.05em" }}>{issue.severity}</span>
                    <p style={{ margin: "4px 0 0", fontSize: 14 }}>{issue.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Invoice ── */}
      {activeTab === "invoice" && (
        <div>
          {!invoiceReady ? (
            <section className="panel">
              <div className="panel-body" style={{ textAlign: "center", padding: "40px 20px" }}>
                <p style={{ color: "#888", fontSize: 14, marginBottom: 16 }}>
                  {updates.length === 0
                    ? "No field updates yet — submit updates from the field view first."
                    : "Click Generate Invoice to build a draft from field data."}
                </p>
                {updates.length > 0 && (
                  <button className="button primary" onClick={generateInvoice} disabled={generatingInvoice}>
                    {generatingInvoice ? "Building…" : "Generate Invoice"}
                  </button>
                )}
              </div>
            </section>
          ) : (
            <div style={{ maxWidth: 780, margin: "0 auto" }}>
              {/* Print button */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }} className="no-print">
                <button className="button" onClick={() => window.print()} style={{ fontSize: 13 }}>🖨 Print / Save as PDF</button>
                <button className="button" onClick={() => setInvoiceReady(false)} style={{ fontSize: 13 }}>Regenerate</button>
              </div>

              {/* Invoice document */}
              <div style={{
                background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10,
                padding: "40px 48px", fontFamily: "system-ui, sans-serif", color: "#1e293b",
                boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
              }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 20, color: "#0f172a" }}>Apex Roofing South Florida</div>
                    <div style={{ fontSize: 13, color: "#64748b", marginTop: 4, lineHeight: 1.7 }}>
                      Miami, FL · (754) 283-7658<br />connect@apexroofing.com
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#3b82f6", marginBottom: 4 }}>Draft Invoice</div>
                    <div style={{ fontWeight: 800, fontSize: 22, color: "#0f172a" }}>#{jobId}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 1.7 }}>
                      Date: {today}<br />Due: {due}
                    </div>
                  </div>
                </div>

                {/* Bill To + Job Info */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32, padding: "20px 0", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 6 }}>Bill To</div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{job.clientName || "—"}</div>
                    {job.clientPhone && <div style={{ fontSize: 13, color: "#64748b" }}>{job.clientPhone}</div>}
                    {job.address && <div style={{ fontSize: 13, color: "#64748b" }}>{job.address}</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 6 }}>Job Details</div>
                    <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.7 }}>
                      <div><strong style={{ color: "#1e293b" }}>Job ID:</strong> {jobId}</div>
                      {job.serviceType && <div><strong style={{ color: "#1e293b" }}>Service:</strong> {job.serviceType}</div>}
                      {job.address && <div><strong style={{ color: "#1e293b" }}>Site:</strong> {job.address}</div>}
                    </div>
                  </div>
                </div>

                {/* Labor */}
                {laborRows.length > 0 && (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#475569", marginBottom: 8 }}>Labor</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                          <th style={thStyle("left")}>Technician</th>
                          <th style={thStyle("left")}>Arrival</th>
                          <th style={thStyle("left")}>Departure</th>
                          <th style={thStyle("right")}>Hours</th>
                          <th style={thStyle("right")}>Rate/hr</th>
                          <th style={thStyle("right")}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {laborRows.map((row, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={tdStyle()}><InlineInput value={row.name} onChange={(v) => setLaborRows(r => r.map((x, j) => j === i ? { ...x, name: v } : x))} placeholder="Name" /></td>
                            <td style={tdStyle()}><InlineInput value={row.arrival} onChange={(v) => setLaborRows(r => r.map((x, j) => j === i ? { ...x, arrival: v } : x))} placeholder="8:00 AM" /></td>
                            <td style={tdStyle()}><InlineInput value={row.departure} onChange={(v) => setLaborRows(r => r.map((x, j) => j === i ? { ...x, departure: v } : x))} placeholder="4:00 PM" /></td>
                            <td style={tdStyle("right")}><InlineInput value={row.hours} onChange={(v) => setLaborRows(r => r.map((x, j) => j === i ? { ...x, hours: v } : x))} placeholder="0" align="right" /></td>
                            <td style={tdStyle("right")}>$<InlineInput value={row.rate} onChange={(v) => setLaborRows(r => r.map((x, j) => j === i ? { ...x, rate: v } : x))} placeholder="65" align="right" width={48} /></td>
                            <td style={{ ...tdStyle("right"), fontWeight: 600 }}>${laborTotal(row).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button className="no-print" onClick={() => setLaborRows(r => [...r, { name: "", arrival: "", departure: "", hours: "", rate: "65" }])} style={{ marginTop: 6, fontSize: 12, color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: 0 }}>+ Add technician</button>
                    <div style={{ textAlign: "right", fontSize: 13, color: "#64748b", marginTop: 4 }}>Labor subtotal: <strong>${laborSubtotal.toFixed(2)}</strong></div>
                  </div>
                )}

                {/* Materials */}
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#475569", marginBottom: 8 }}>Materials</div>
                  {materialRows.length === 0 ? (
                    <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 6px" }}>No materials extracted. Add manually below.</p>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 6 }}>
                      <thead>
                        <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                          <th style={thStyle("left")}>Item</th>
                          <th style={thStyle("right")}>Qty</th>
                          <th style={thStyle("left")}>Unit</th>
                          <th style={thStyle("right")}>Unit Price</th>
                          <th style={thStyle("right")}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {materialRows.map((row, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={tdStyle()}><InlineInput value={row.item} onChange={(v) => setMaterialRows(r => r.map((x, j) => j === i ? { ...x, item: v } : x))} placeholder="Item" /></td>
                            <td style={tdStyle("right")}><InlineInput value={row.quantity} onChange={(v) => setMaterialRows(r => r.map((x, j) => j === i ? { ...x, quantity: v } : x))} placeholder="0" align="right" width={56} /></td>
                            <td style={tdStyle()}><InlineInput value={row.unit} onChange={(v) => setMaterialRows(r => r.map((x, j) => j === i ? { ...x, unit: v } : x))} placeholder="sq/pieces/lbs" /></td>
                            <td style={tdStyle("right")}>$<InlineInput value={row.unitPrice} onChange={(v) => setMaterialRows(r => r.map((x, j) => j === i ? { ...x, unitPrice: v } : x))} placeholder="0.00" align="right" width={64} /></td>
                            <td style={{ ...tdStyle("right"), fontWeight: 600 }}>${materialTotal(row).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <button className="no-print" onClick={() => setMaterialRows(r => [...r, { item: "", quantity: "1", unit: "", unitPrice: "" }])} style={{ fontSize: 12, color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: 0 }}>+ Add material</button>
                  {materialRows.length > 0 && <div style={{ textAlign: "right", fontSize: 13, color: "#64748b", marginTop: 4 }}>Materials subtotal: <strong>${materialSubtotal.toFixed(2)}</strong></div>}
                </div>

                {/* Other charges */}
                {otherRows.length > 0 && (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#475569", marginBottom: 8 }}>Other Charges</div>
                    {otherRows.map((row, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
                        <InlineInput value={row.description} onChange={(v) => setOtherRows(r => r.map((x, j) => j === i ? { ...x, description: v } : x))} placeholder="Description" />
                        <span>$<InlineInput value={row.amount} onChange={(v) => setOtherRows(r => r.map((x, j) => j === i ? { ...x, amount: v } : x))} placeholder="0.00" align="right" width={80} /></span>
                      </div>
                    ))}
                  </div>
                )}
                <button className="no-print" onClick={() => setOtherRows(r => [...r, { description: "", amount: "" }])} style={{ fontSize: 12, color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: "0 0 24px", display: "block" }}>+ Add other charge (disposal, permit, etc.)</button>

                {/* Totals */}
                <div style={{ borderTop: "2px solid #e2e8f0", paddingTop: 16, marginTop: 8 }}>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <table style={{ fontSize: 13, minWidth: 260 }}>
                      <tbody>
                        <tr>
                          <td style={{ padding: "4px 16px 4px 0", color: "#64748b" }}>Subtotal</td>
                          <td style={{ textAlign: "right", fontWeight: 600 }}>${subtotal.toFixed(2)}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "4px 16px 4px 0", color: "#64748b" }}>
                            Tax (
                            <input
                              value={taxRate}
                              onChange={(e) => setTaxRate(e.target.value)}
                              style={{ width: 32, border: "none", borderBottom: "1px dashed #cbd5e1", textAlign: "center", fontSize: 13, color: "#1e293b", padding: "0 2px" }}
                            />
                            %)
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 600 }}>${tax.toFixed(2)}</td>
                        </tr>
                        <tr style={{ borderTop: "2px solid #0f172a" }}>
                          <td style={{ padding: "10px 16px 4px 0", fontWeight: 800, fontSize: 15 }}>Total Due</td>
                          <td style={{ textAlign: "right", fontWeight: 800, fontSize: 18, color: "#0f172a", paddingTop: 10 }}>${grandTotal.toFixed(2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Notes / payment terms */}
                <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 6 }}>Notes & Payment Terms</div>
                  <textarea
                    value={invoiceNotes}
                    onChange={(e) => setInvoiceNotes(e.target.value)}
                    rows={3}
                    style={{ width: "100%", fontSize: 13, color: "#475569", border: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.6, background: "transparent" }}
                  />
                </div>

                <div style={{ marginTop: 24, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
                  This is a draft invoice. Please review all amounts before sending to client.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Report ── */}
      {activeTab === "report" && (
        <div>
          {!report ? (
            <section className="panel">
              <div className="panel-body" style={{ textAlign: "center", padding: "40px 20px" }}>
                <p style={{ color: "#888", fontSize: 14, marginBottom: 16 }}>
                  {updates.length === 0
                    ? "No field updates yet — submit updates from the field view first."
                    : "Click Generate Report to produce a job summary."}
                </p>
                {updates.length > 0 && (
                  <button className="button" onClick={generateReport} disabled={generatingReport}>
                    {generatingReport ? "Generating…" : "Generate Report"}
                  </button>
                )}
              </div>
            </section>
          ) : (
            <div style={{ maxWidth: 720, margin: "0 auto" }}>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }} className="no-print">
                <button className="button" onClick={() => window.print()} style={{ fontSize: 13 }}>🖨 Print / Save as PDF</button>
                <button className="button" onClick={() => { setReport(null); generateReport(); }} style={{ fontSize: 13 }}>Regenerate</button>
              </div>
              <ReportRenderer report={report} job={job} jobId={jobId} />
            </div>
          )}
        </div>
      )}

      {/* Raw field updates */}
      <section className="panel no-print" style={{ marginTop: 20 }}>
        <div className="panel-header">
          <h2 className="panel-title">Field Updates ({updates.length})</h2>
          <a className="button" href={`/company/field?jobId=${jobId}${preview ? `&preview=${preview}` : ""}`} style={{ fontSize: 12 }}>Submit update ↗</a>
        </div>
        <div className="panel-body">
          {updates.length === 0 ? (
            <p style={{ color: "#888", fontSize: 14 }}>No field updates yet. Send crew to the field view to submit voice or text updates.</p>
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
                  <p style={{ margin: 0, fontSize: 14, color: "#334155", wordBreak: "break-word" }}>
                    {u.rawText.length > 300 ? u.rawText.slice(0, 300) + "…" : u.rawText}
                  </p>
                  {u.parseError && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#b91c1c" }}>Parse failed: {u.parseError}</p>}
                  {u.parsed && (
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "#15803d" }}>
                      ✓ Parsed: {u.parsed.timeline.length} events · {u.parsed.materials.length} materials · {u.parsed.labor.length} crew · {u.parsed.issues.length} issues
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

// ── Inline editable input cell ────────────────────────────────────────────────
function InlineInput({ value, onChange, placeholder, align, width }: {
  value: string; onChange: (v: string) => void; placeholder?: string; align?: "right"; width?: number;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        border: "none", borderBottom: "1px dashed #cbd5e1", background: "transparent",
        fontSize: 13, color: "#1e293b", padding: "2px 4px", width: width ?? "100%",
        textAlign: align === "right" ? "right" : "left", fontFamily: "inherit",
        outline: "none",
      }}
    />
  );
}

// ── Report renderer — converts markdown-like text to styled sections ───────────
function ReportRenderer({ report, job, jobId }: { report: string; job: Job; jobId: string }) {
  const lines = report.split("\n");

  return (
    <div style={{
      background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10,
      padding: "40px 48px", fontFamily: "system-ui, sans-serif", color: "#1e293b",
      boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
    }}>
      {/* Report header */}
      <div style={{ marginBottom: 28, paddingBottom: 20, borderBottom: "2px solid #0f172a" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#3b82f6", marginBottom: 6 }}>Job Report</div>
        <h1 style={{ fontWeight: 800, fontSize: 22, margin: "0 0 4px", color: "#0f172a" }}>{job.title}</h1>
        <div style={{ fontSize: 13, color: "#64748b", display: "flex", gap: 20, flexWrap: "wrap", marginTop: 8 }}>
          <span><strong>Job ID:</strong> {jobId}</span>
          {job.clientName && <span><strong>Client:</strong> {job.clientName}</span>}
          {job.address && <span><strong>Address:</strong> {job.address}</span>}
          {job.serviceType && <span><strong>Service:</strong> {job.serviceType}</span>}
          <span><strong>Status:</strong> {job.status}</span>
          <span><strong>Date:</strong> {new Date(job.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
        </div>
      </div>

      {/* Rendered sections */}
      {(() => {
        const sections: Array<{ heading: string; items: string[] }> = [];
        let current: { heading: string; items: string[] } | null = null;

        for (const line of lines) {
          if (line.startsWith("## ")) {
            if (current) sections.push(current);
            current = { heading: line.replace("## ", ""), items: [] };
          } else if (line.startsWith("- ") && current) {
            current.items.push(line.replace(/^- /, ""));
          } else if (line.startsWith("### ") && current) {
            current.items.push("__sub__" + line.replace("### ", ""));
          }
        }
        if (current) sections.push(current);

        return sections
          .filter((s) => !s.heading.startsWith("Job Report") && !s.heading.startsWith("Field Notes") && s.items.length > 0)
          .map((section) => (
            <div key={section.heading} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#475569", marginBottom: 10 }}>{section.heading}</div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                {section.items.map((item, i) => (
                  item.startsWith("__sub__") ? (
                    <li key={i} style={{ fontWeight: 600, fontSize: 13, color: "#1e293b", marginTop: 8 }}>{item.replace("__sub__", "")}</li>
                  ) : (
                    <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "#334155" }}>
                      <span style={{ color: "#94a3b8", marginTop: 2 }}>·</span>
                      <span>{item}</span>
                    </li>
                  )
                ))}
              </ul>
            </div>
          ));
      })()}

      <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid #e2e8f0", fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
        Report generated by Luxor AI · {new Date().toLocaleString("en-US")}
      </div>
    </div>
  );
}

// Style helpers
function thStyle(align: "left" | "right" = "left"): React.CSSProperties {
  return { padding: "8px 12px", textAlign: align, fontWeight: 600, color: "#64748b", fontSize: 12 };
}
function tdStyle(align: "left" | "right" = "left"): React.CSSProperties {
  return { padding: "8px 12px", textAlign: align };
}
