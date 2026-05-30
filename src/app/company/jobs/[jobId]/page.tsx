"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";
import type { Job, FieldUpdate, ParsedUpdate } from "@/types/jobs";
import type { BusinessConfig } from "@/types";

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
  const [businessConfig, setBusinessConfig] = useState<BusinessConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"timeline" | "materials" | "labor" | "issues" | "invoice" | "report">("timeline");
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

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

  // Send invoice state
  const [sendEmail, setSendEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showSendPanel, setShowSendPanel] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      const [jobRes, updatesRes, configRes] = await Promise.all([
        fetch(`/api/jobs?businessId=${businessId}`).then((r) => r.json()),
        fetch(`/api/jobs/${jobId}/updates?businessId=${businessId}`).then((r) => r.json()),
        fetch(`/api/businesses/${businessId}/agent-config`).then((r) => r.json()).catch(() => null),
      ]);
      const found = (jobRes.jobs as Job[]).find((j) => j.jobId === jobId) ?? null;
      setJob(found);
      setUpdates(updatesRes.updates ?? []);
      if (configRes?.config) setBusinessConfig(configRes.config as BusinessConfig);
    } catch {
      // silently fail — show not found below
    }
    setLoading(false);
  }, [businessId, jobId]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(newStatus: string) {
    if (!businessId || !job || updatingStatus) return;
    setUpdatingStatus(newStatus);
    try {
      await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, status: newStatus }),
      });
      setJob((j) => j ? { ...j, status: newStatus as Job["status"] } : j);
    } finally {
      setUpdatingStatus(null);
    }
  }

  const allParsed = updates.map((u) => u.parsed).filter(Boolean) as ParsedUpdate[];
  const timeline = allParsed.flatMap((p) => p.timeline);
  const materials = allParsed.flatMap((p) => p.materials);
  const labor = allParsed.flatMap((p) => p.labor);
  const issues = allParsed.flatMap((p) => p.issues);

  const defaultLaborRate = String(businessConfig?.laborRate?.defaultHourlyRate ?? 65);

  async function generateInvoice() {
    setGeneratingInvoice(true);
    setInvoiceError(null);
    try {
      // Build labor rows — auto-calculate hours from arrival/departure when not explicitly stated
      const newLaborRows: LaborRow[] = labor.map((l) => {
        const arrival = l.arrivalTime ?? "";
        const departure = l.departureTime ?? "";
        const autoHours = calcHours(arrival, departure);
        const hours = l.hours != null ? String(l.hours) : autoHours;
        return { name: l.description, arrival, departure, hours, rate: l.rate != null ? String(l.rate) : defaultLaborRate };
      });
      if (newLaborRows.length === 0) {
        newLaborRows.push({ name: "", arrival: "", departure: "", hours: "", rate: defaultLaborRate });
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

  // Auto-calculate hours from arrival/departure time strings (e.g. "08:00", "8:00 AM", "4:00 PM", "16:00")
  function calcHours(arrival: string, departure: string): string {
    const parse = (t: string): number | null => {
      t = t.trim();
      const ampm = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (ampm) {
        let h = parseInt(ampm[1]), m = parseInt(ampm[2]);
        if (ampm[3].toUpperCase() === "PM" && h !== 12) h += 12;
        if (ampm[3].toUpperCase() === "AM" && h === 12) h = 0;
        return h * 60 + m;
      }
      const h24 = t.match(/^(\d{1,2}):(\d{2})$/);
      if (h24) return parseInt(h24[1]) * 60 + parseInt(h24[2]);
      return null;
    };
    const a = parse(arrival), d = parse(departure);
    if (a === null || d === null || d <= a) return "";
    const total = (d - a) / 60;
    const net = total > 5 ? total - 0.5 : total; // subtract lunch if > 5h
    return String(Math.round(net * 10) / 10);
  }

  async function sendInvoice() {
    if (!sendEmail.trim()) { setSendError("Enter a recipient email."); return; }
    setSending(true); setSendError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/invoice/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          to: sendEmail.trim(),
          jobId,
          clientName: job?.clientName,
          address: job?.address,
          serviceType: job?.serviceType,
          laborRows,
          materialRows,
          otherRows,
          taxRate,
          subtotal,
          tax,
          grandTotal,
          invoiceNotes,
        }),
      });
      if (res.ok) {
        setSendSuccess(true);
        setSendEmail("");
        setTimeout(() => { setSendSuccess(false); setShowSendPanel(false); }, 3000);
      } else {
        const d = await res.json().catch(() => ({}));
        setSendError(d.error ?? "Failed to send. Try again.");
      }
    } catch {
      setSendError("Network error. Try again.");
    } finally {
      setSending(false);
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
          <button className="button" onClick={() => {
            const link = `${window.location.origin}/company/field?businessId=${businessId}&jobId=${jobId}`;
            navigator.clipboard.writeText(link).then(() => alert("Field link copied — send to your foreman.")).catch(() => prompt("Copy this link for your foreman:", link));
          }}>Send to foreman ↗</button>
          <button className="button" onClick={generateReport} disabled={generatingReport || generatingInvoice || updates.length === 0}>
            {generatingReport ? "⏳ Generating…" : "Generate Report"}
          </button>
          <button className="button primary" onClick={generateInvoice} disabled={generatingReport || generatingInvoice || updates.length === 0}>
            {generatingInvoice ? "⏳ Generating…" : "Generate Invoice"}
          </button>
        </div>
      </header>

      {/* Job progress bar — 5 roofing-native steps */}
      <div className="job-progress no-print">
        {JOB_STEPS.map((step, i) => {
          const currentIdx = statusToStepIdx(job.status);
          const done = i < currentIdx;
          const active = i === currentIdx;
          const isUpdating = updatingStatus === step.key;
          const isClickable = step.key !== job.status && !updatingStatus;
          return (
            <div key={step.key} style={{ display: "flex", alignItems: "center", flex: i < JOB_STEPS.length - 1 ? "1" : "0" }}>
              <div
                className="job-progress-step-wrapper"
                onClick={() => isClickable && updateStatus(step.key)}
                title={isClickable ? `Move to ${step.label}` : undefined}
                style={{ cursor: isClickable ? "pointer" : "default", opacity: isUpdating ? 0.5 : 1 }}
              >
                <div className={`job-progress-step ${done ? "done" : active ? "active" : "pending"}`}>
                  {isUpdating ? "…" : done ? "✓" : i + 1}
                </div>
                <span className={`job-progress-label ${done ? "done" : active ? "active" : "pending"}`}>{step.label}</span>
              </div>
              {i < JOB_STEPS.length - 1 && <div className={`job-progress-line ${done ? "done" : ""}`} />}
            </div>
          );
        })}
      </div>

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
              {/* Invoice toolbar */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12, flexWrap: "wrap" }} className="no-print">
                <button className="button" onClick={() => { setShowSendPanel(p => !p); setSendSuccess(false); setSendError(null); }} style={{ fontSize: 13, background: showSendPanel ? "#eff6ff" : undefined }}>
                  📧 Send to Customer
                </button>
                <button className="button" onClick={() => window.print()} style={{ fontSize: 13 }}>🖨 Print / Save as PDF</button>
                <button className="button" onClick={() => setInvoiceReady(false)} style={{ fontSize: 13 }}>Regenerate</button>
              </div>

              {/* Send invoice panel */}
              {showSendPanel && (
                <div style={{ marginBottom: 16, padding: "16px 20px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10 }} className="no-print">
                  <p style={{ margin: "0 0 10px", fontWeight: 600, fontSize: 14, color: "#0369a1" }}>Send draft invoice by email</p>
                  {sendSuccess ? (
                    <p style={{ margin: 0, color: "#15803d", fontWeight: 600 }}>✓ Invoice sent successfully!</p>
                  ) : (
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <input
                        type="email"
                        value={sendEmail}
                        onChange={e => setSendEmail(e.target.value)}
                        placeholder={job?.clientName ? `Email for ${job.clientName}` : "customer@email.com"}
                        style={{ flex: 1, minWidth: 200, padding: "9px 12px", borderRadius: 8, border: "1.5px solid #bae6fd", fontSize: 14, outline: "none" }}
                      />
                      <button onClick={sendInvoice} disabled={sending} className="button primary" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                        {sending ? "Sending…" : "Send Invoice"}
                      </button>
                    </div>
                  )}
                  {sendError && <p style={{ margin: "8px 0 0", color: "#b91c1c", fontSize: 13 }}>{sendError}</p>}
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b" }}>Sends the current invoice totals as a draft. Customer can reply to discuss.</p>
                </div>
              )}

              {/* Invoice document */}
              <div style={{
                background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10,
                padding: "40px 48px", fontFamily: "system-ui, sans-serif", color: "#1e293b",
                boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
              }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 20, color: "#0f172a" }}>{job.title}</div>
                    <div style={{ fontSize: 13, color: "#64748b", marginTop: 4, lineHeight: 1.7 }}>
                      {job.address && <>{job.address}<br /></>}
                      {job.clientPhone && <>{job.clientPhone}<br /></>}
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
                          <th style={thStyle("right")} className="no-print"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {laborRows.map((row, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={tdStyle()}><InlineInput value={row.name} onChange={(v) => setLaborRows(r => r.map((x, j) => j === i ? { ...x, name: v } : x))} placeholder="Name" /></td>
                            <td style={tdStyle()}><InlineInput value={row.arrival} onChange={(v) => setLaborRows(r => r.map((x, j) => {
                              if (j !== i) return x;
                              const u = { ...x, arrival: v };
                              u.hours = u.hours === "" || u.hours === calcHours(x.arrival, x.departure) ? calcHours(v, u.departure) : u.hours;
                              return u;
                            }))} placeholder="8:00 AM" /></td>
                            <td style={tdStyle()}><InlineInput value={row.departure} onChange={(v) => setLaborRows(r => r.map((x, j) => {
                              if (j !== i) return x;
                              const u = { ...x, departure: v };
                              u.hours = u.hours === "" || u.hours === calcHours(x.arrival, x.departure) ? calcHours(u.arrival, v) : u.hours;
                              return u;
                            }))} placeholder="4:00 PM" /></td>
                            <td style={tdStyle("right")}><InlineInput value={row.hours} onChange={(v) => setLaborRows(r => r.map((x, j) => j === i ? { ...x, hours: v } : x))} placeholder="0" align="right" /></td>
                            <td style={tdStyle("right")}>$<InlineInput value={row.rate} onChange={(v) => setLaborRows(r => r.map((x, j) => j === i ? { ...x, rate: v } : x))} placeholder={defaultLaborRate} align="right" width={48} /></td>
                            <td style={{ ...tdStyle("right"), fontWeight: 600 }}>${laborTotal(row).toFixed(2)}</td>
                            <td style={tdStyle("right")} className="no-print"><button onClick={() => setLaborRows(r => r.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16, padding: "0 4px" }} title="Remove">×</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button className="no-print" onClick={() => setLaborRows(r => [...r, { name: "", arrival: "", departure: "", hours: "", rate: defaultLaborRate }])} style={{ marginTop: 6, fontSize: 12, color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: 0 }}>+ Add technician</button>
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
                          <th style={thStyle("right")} className="no-print"></th>
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
                            <td style={tdStyle("right")} className="no-print"><button onClick={() => setMaterialRows(r => r.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16, padding: "0 4px" }} title="Remove">×</button></td>
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

      {/* Field updates — parsed summary cards */}
      <section className="panel no-print" style={{ marginTop: 20 }}>
        <div className="panel-header">
          <h2 className="panel-title">Field Updates ({updates.length})</h2>
          <a className="button" href={`/company/field?jobId=${jobId}${preview ? `&preview=${preview}` : ""}`} style={{ fontSize: 12 }}>Submit update ↗</a>
        </div>
        <div className="panel-body">
          {updates.length === 0 ? (
            <p style={{ color: "#888", fontSize: 14 }}>No field updates yet. Send your foreman the field link to submit voice or text updates.</p>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {updates.map((u, i) => (
                <ParsedUpdateCard key={u.updateId} update={u} index={i} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

// ── Job status steps ─────────────────────────────────────────────────────────
const JOB_STEPS = [
  { key: "inspection", label: "Inspection" },
  { key: "quoted",     label: "Quoted" },
  { key: "in_progress", label: "Working" },
  { key: "invoiced",   label: "Invoiced" },
  { key: "complete",   label: "Complete" },
] as const;

function statusToStepIdx(status: string): number {
  const map: Record<string, number> = {
    open: 0, inspection: 0, quoted: 1, in_progress: 2, invoiced: 3, complete: 4,
  };
  return map[status] ?? 0;
}

// ── Parsed field update card ──────────────────────────────────────────────────
function ParsedUpdateCard({ update, index }: { update: FieldUpdate; index: number }) {
  const [showRaw, setShowRaw] = useState(false);
  const p = update.parsed;
  const totalItems = p ? p.timeline.length + p.materials.length + p.labor.length + p.issues.length : 0;
  const hasData = totalItems > 0;

  return (
    <div style={{ padding: "14px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: hasData ? 12 : 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>Update {index + 1}</span>
          {update.submittedBy && <span style={{ fontSize: 12, color: "#94a3b8" }}>by {update.submittedBy}</span>}
          {p && !update.parseError && (
            <span style={{ fontSize: 11, fontWeight: 600, color: "#15803d", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 4, padding: "1px 6px" }}>✓ AI parsed</span>
          )}
          {update.parseError && (
            <span style={{ fontSize: 11, fontWeight: 600, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 4, padding: "1px 6px" }}>Parse failed</span>
          )}
        </div>
        <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>
          {new Date(update.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </span>
      </div>

      {/* Parsed content */}
      {p && hasData && (
        <div style={{ display: "grid", gap: 10 }}>
          {p.timeline.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", marginBottom: 4 }}>Timeline</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {p.timeline.map((t, i) => (
                  <span key={i} style={{ fontSize: 12, color: "#334155", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "3px 8px" }}>
                    {t.time ? <><strong>{t.time}</strong> — {t.description}</> : t.description}
                  </span>
                ))}
              </div>
            </div>
          )}
          {p.materials.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", marginBottom: 4 }}>Materials</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {p.materials.map((m, i) => (
                  <span key={i} style={{ fontSize: 12, color: "#334155", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "3px 8px" }}>
                    {[m.quantity, m.unit, m.item].filter(Boolean).join(" ")}
                  </span>
                ))}
              </div>
            </div>
          )}
          {p.labor.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", marginBottom: 4 }}>Labor / Crew</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {p.labor.map((l, i) => (
                  <span key={i} style={{ fontSize: 12, color: "#334155", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "3px 8px" }}>
                    {l.description}
                    {l.hours ? ` · ${l.hours}h` : ""}
                    {l.arrivalTime && l.departureTime ? ` · ${l.arrivalTime}–${l.departureTime}` : l.arrivalTime ? ` · from ${l.arrivalTime}` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}
          {p.issues.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", marginBottom: 4 }}>Issues</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {p.issues.map((iss, i) => (
                  <span key={i} style={{ fontSize: 12, color: SEVERITY_COLOR[iss.severity], background: SEVERITY_COLOR[iss.severity] + "18", border: `1px solid ${SEVERITY_COLOR[iss.severity]}40`, borderRadius: 6, padding: "3px 8px" }}>
                    {iss.description}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {p && !hasData && (
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>No extracted items</p>
      )}
      {!p && !update.parseError && (
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#94a3b8" }}>Parsing…</p>
      )}
      {update.parseError && (
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#b91c1c" }}>Parse error: {update.parseError}</p>
      )}

      {/* View original disclosure */}
      <button
        onClick={() => setShowRaw((r) => !r)}
        style={{ marginTop: 10, fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
      >
        {showRaw ? "Hide original" : "View original"}
      </button>
      {showRaw && (
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "#475569", lineHeight: 1.5, wordBreak: "break-word", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 10px" }}>
          {update.rawText}
        </p>
      )}
    </div>
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
