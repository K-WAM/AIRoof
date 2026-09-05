"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";
import { buildProjection } from "@/lib/jobs/projection";
import { lookupUnitPrice } from "@/types/library";
import type { Job, FieldUpdate, ParsedUpdate, JobPhotoMeta } from "@/types/jobs";
import type { LibraryPricing } from "@/types/library";
import type { BusinessConfig } from "@/types";
import {
  ArrowLeft,
  Briefcase,
  ClipboardCopy,
  ClipboardList,
  ExternalLink,
  FileText,
  Pencil,
  Plus,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";

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
  const [library, setLibrary] = useState<LibraryPricing | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"timeline" | "materials" | "labor" | "issues" | "photos" | "invoice" | "report">("timeline");
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // No-login field QR: a one-time, ten-minute grant for a crew member who
  // has no portal account. "Copy field link" above is the authenticated
  // path — this is the unauthenticated one.
  const [qrOpen, setQrOpen] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrFieldUrl, setQrFieldUrl] = useState("");
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null);
  const [qrLinkCopied, setQrLinkCopied] = useState(false);

  // Photos (Phase 2) — metas loaded lazily when the tab opens; full blobs on lightbox open.
  const [photos, setPhotos] = useState<JobPhotoMeta[]>([]);
  const [photosLoaded, setPhotosLoaded] = useState(false);
  const [lightbox, setLightbox] = useState<{ photoId: string; label: string; fullB64?: string } | null>(null);

  // Edit buffer for the data tabs (null = read-only). Edits write to job.parsed via PATCH.
  const [editParsed, setEditParsed] = useState<ParsedUpdate | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

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
  const [reportError] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [reportNotes, setReportNotes] = useState("");
  const [reportPhotos, setReportPhotos] = useState<Array<{ label: string; fullB64: string }>>([]);
  const [showReportSend, setShowReportSend] = useState(false);
  const [reportTo, setReportTo] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [reportSendError, setReportSendError] = useState<string | null>(null);

  // Send invoice state
  const [sendEmail, setSendEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showSendPanel, setShowSendPanel] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      const [jobRes, updatesRes, configRes, libRes] = await Promise.all([
        fetch(`/api/jobs/${jobId}?businessId=${businessId}`).then((r) => r.json()),
        fetch(`/api/jobs/${jobId}/updates?businessId=${businessId}`).then((r) => r.json()),
        fetch(`/api/businesses/${businessId}/agent-config`).then((r) => r.json()).catch(() => null),
        fetch(`/api/company/library?businessId=${businessId}`).then((r) => r.json()).catch(() => null),
      ]);
      const found = (jobRes.job as Job) ?? null;
      setJob(found);
      setUpdates(updatesRes.updates ?? []);
      if (configRes?.config) setBusinessConfig(configRes.config as BusinessConfig);
      if (libRes?.library) setLibrary(libRes.library as LibraryPricing);
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

  // Single source of truth: the job's authoritative projection. Backfill from the
  // ledger for legacy jobs that predate job.parsed. buildProjection merges duplicate
  // materials by name, so the "2×4s 50 / 50 / 150" duplication is gone.
  const projection: ParsedUpdate = job?.parsed ?? buildProjection(updates);
  const allParsed = [projection];
  const view = editParsed ?? projection;
  const timeline = view.timeline;
  const materials = view.materials;
  const labor = view.labor;
  const issues = view.issues;
  const editing = editParsed !== null;
  // Multi-day jobs: show the date alongside each timeline event's time.
  const timelineMultiDay = new Set(timeline.map((t) => (t.dateMs ? new Date(t.dateMs).toDateString() : "")).filter(Boolean)).size > 1;
  const fmtDay = (ms?: number) => (ms ? new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");

  function startEdit() {
    setEditParsed(JSON.parse(JSON.stringify(projection)) as ParsedUpdate);
  }
  function cancelEdit() {
    setEditParsed(null);
  }
  async function saveEdit() {
    if (!businessId || !editParsed) return;
    setSavingEdit(true);
    try {
      await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, parsed: editParsed }),
      });
      setJob((j) => (j ? { ...j, parsed: editParsed } : j));
      setEditParsed(null);
    } finally {
      setSavingEdit(false);
    }
  }
  // Mutators for the edit buffer
  function mutate(fn: (p: ParsedUpdate) => void) {
    setEditParsed((prev) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev)) as ParsedUpdate;
      fn(next);
      return next;
    });
  }

  // Lazy-load photo thumbnails the first time the Photos tab is opened.
  useEffect(() => {
    if (activeTab !== "photos" || photosLoaded || !businessId) return;
    fetch(`/api/jobs/${jobId}/photos?businessId=${businessId}`)
      .then((r) => r.json())
      .then((d) => setPhotos((d.photos ?? []) as JobPhotoMeta[]))
      .catch(() => {})
      .finally(() => setPhotosLoaded(true));
  }, [activeTab, photosLoaded, businessId, jobId]);

  async function openLightbox(meta: JobPhotoMeta) {
    setLightbox({ photoId: meta.photoId, label: meta.label });
    const r = await fetch(`/api/jobs/${jobId}/photos/${meta.photoId}?businessId=${businessId}`).then((x) => x.json()).catch(() => null);
    if (r?.fullB64) setLightbox((lb) => (lb && lb.photoId === meta.photoId ? { ...lb, fullB64: r.fullB64 } : lb));
  }

  async function toggleInclude(meta: JobPhotoMeta) {
    const next = !meta.includeInReport;
    setPhotos((ps) => ps.map((p) => (p.photoId === meta.photoId ? { ...p, includeInReport: next } : p)));
    await fetch(`/api/jobs/${jobId}/photos/${meta.photoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, includeInReport: next }),
    }).catch(() => {});
  }

  async function deletePhoto(meta: JobPhotoMeta) {
    setPhotos((ps) => ps.filter((p) => p.photoId !== meta.photoId));
    await fetch(`/api/jobs/${jobId}/photos/${meta.photoId}?businessId=${businessId}`, { method: "DELETE" }).catch(() => {});
  }

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

      // Build material rows — auto-fill unit price from the Library catalog when the field
      // update didn't state a cost. Never fabricate: a no-match leaves the field blank.
      const catalog = library?.materials ?? [];
      const newMaterialRows: MaterialRow[] = materials.map((m) => {
        let unitPrice = "";
        if (m.cost != null && m.quantity) {
          unitPrice = String((m.cost / (parseFloat(m.quantity) || 1)).toFixed(2));
        } else {
          const fromCatalog = lookupUnitPrice(catalog, m.item);
          if (fromCatalog != null) unitPrice = String(fromCatalog);
        }
        return { item: m.item, quantity: m.quantity ?? "1", unit: m.unit ?? "", unitPrice };
      });

      setLaborRows(newLaborRows);
      setMaterialRows(newMaterialRows);
      setOtherRows([]);
      if (library?.defaultTaxRate != null) setTaxRate(String(library.defaultTaxRate));
      else if (businessConfig?.defaultTaxRate != null) setTaxRate(String(businessConfig.defaultTaxRate));
      setInvoiceReady(true);
      setActiveTab("invoice");
    } catch (e) {
      setInvoiceError(e instanceof Error ? e.message : "Failed to generate invoice");
    } finally {
      setGeneratingInvoice(false);
    }
  }

  async function generateReport() {
    setReport("ready");
    setActiveTab("report");
    setReportNotes(job?.reportNotes ?? "");
    // Load full-res blobs for the photos marked include-in-report (≤ 8 → 2 pages).
    let metas = photos;
    if (!photosLoaded) {
      metas = await fetch(`/api/jobs/${jobId}/photos?businessId=${businessId}`).then((r) => r.json()).then((d) => (d.photos ?? []) as JobPhotoMeta[]).catch(() => []);
      setPhotos(metas);
      setPhotosLoaded(true);
    }
    const included = metas.filter((p) => p.includeInReport).slice(0, 8);
    const withBlobs = await Promise.all(
      included.map(async (p) => {
        const r = await fetch(`/api/jobs/${jobId}/photos/${p.photoId}?businessId=${businessId}`).then((x) => x.json()).catch(() => null);
        return r?.fullB64 ? { label: p.label, fullB64: r.fullB64 as string } : null;
      })
    );
    setReportPhotos(withBlobs.filter(Boolean) as Array<{ label: string; fullB64: string }>);
  }

  async function openFieldQr() {
    setQrOpen(true);
    setQrLoading(true);
    setQrError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/field-qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not generate a field QR code");
      // Dynamic import (not a static top-level one) so `qrcode` only enters
      // this route's bundle once a staff member actually opens the QR modal
      // — same code-splitting principle T-068 applied to Calendar's dnd-kit.
      const { default: QRCode } = await import("qrcode");
      const dataUrl = await QRCode.toDataURL(data.fieldUrl as string, {
        width: 220,
        margin: 2,
        color: { dark: "#0f172a", light: "#ffffff" },
      });
      setQrDataUrl(dataUrl);
      setQrFieldUrl(data.fieldUrl as string);
      setQrExpiresAt(data.expiresAt as number);
    } catch (err) {
      setQrError(err instanceof Error ? err.message : "Could not generate a field QR code");
    } finally {
      setQrLoading(false);
    }
  }

  async function saveReportNotes() {
    if (!businessId) return;
    await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, reportNotes }),
    }).catch(() => {});
    setJob((j) => (j ? { ...j, reportNotes } : j));
  }

  async function mailReport() {
    if (!businessId || !reportTo.trim()) { setReportSendError("Enter a recipient email."); return; }
    setReportSending(true);
    setReportSendError(null);
    try {
      await saveReportNotes();
      const res = await fetch(`/api/jobs/${jobId}/report/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, to: reportTo.trim(), reportNotes, photos: reportPhotos }),
      });
      if (res.ok) {
        setReportSent(true);
        setTimeout(() => { setReportSent(false); setShowReportSend(false); }, 3000);
      } else {
        const d = await res.json().catch(() => ({}));
        setReportSendError(d.error ?? "Failed to send.");
      }
    } catch {
      setReportSendError("Network error. Try again.");
    } finally {
      setReportSending(false);
    }
  }

  // Auto-calculate hours from arrival/departure time strings (e.g. "08:00", "8:00 AM", "4:00 PM", "16:00")
  function calcHours(arrival: string, departure: string): string {
    const parse = (t: string): number | null => {
      t = t.trim();
      const ampm = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (ampm) {
        let h = parseInt(ampm[1]);
        const m = parseInt(ampm[2]);
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
    { id: "photos", label: photosLoaded ? `Photos (${photos.length})` : "Photos" },
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
          /* Print ONLY the document — strip all app chrome so a PDF reads like a real invoice */
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .company-topbar, .company-nav, .company-sidebar, .admin-sidebar { display: none !important; }
          .company-shell, .admin-shell { grid-template-columns: 1fr !important; }
          .company-main, .admin-main { padding: 0 !important; background: #fff !important; }
          body { background: #fff !important; }
          .panel { box-shadow: none; border: none; }
          .invoice-doc, .report-doc {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            max-width: 100% !important;
            margin: 0 auto !important;
          }
          @page { margin: 0.5in; }
        }
      `}</style>

      <header className="page-header no-print">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <a href={`/company/jobs${previewSuffix}`} style={{ color: "#64748b", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <ArrowLeft size={13} strokeWidth={1.75} />
              Jobs
            </a>
            <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 18, color: "#1e293b" }}>{jobId}</span>
          </div>
          <h1 className="page-title" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
            <Briefcase size={20} strokeWidth={1.75} />
            {job.title}
          </h1>
          {job.address && <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>{job.address}</p>}
          {job.clientName && <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>{job.clientName}{job.clientPhone ? ` · ${job.clientPhone}` : ""}</p>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button" title="Copies a field-log link you can text or email to your crew" onClick={() => {
            const link = `${window.location.origin}/company/field?businessId=${businessId}&jobId=${jobId}`;
            navigator.clipboard.writeText(link).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2500); }).catch(() => prompt("Copy this link for your foreman:", link));
          }} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ClipboardCopy size={15} strokeWidth={1.75} />
            {linkCopied ? "Link copied" : "Copy field link"}
          </button>
          <button className="button" title="A QR code a crew member can scan with no portal login — expires in 10 minutes" onClick={openFieldQr} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <QrCode size={15} strokeWidth={1.75} />
            Field QR
          </button>
          <button className="button" onClick={generateReport} disabled={generatingInvoice || updates.length === 0} title={updates.length === 0 ? "Add a field update first" : undefined} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <FileText size={15} strokeWidth={1.75} />
            Generate Report
          </button>
          <button className="button primary" onClick={generateInvoice} disabled={generatingInvoice || updates.length === 0} title={updates.length === 0 ? "Add a field update first" : undefined} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Receipt size={15} strokeWidth={1.75} />
            {generatingInvoice ? "Generating…" : "Generate Invoice"}
          </button>
        </div>
      </header>

      {/* Job progress bar — 5 steps, shared by every field-service vertical */}
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
            color: activeTab === tab.id ? "var(--accent)" : "#64748b",
            borderBottom: activeTab === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
            marginBottom: -2, fontSize: 13,
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Edit / Save / Cancel — data tabs only */}
      {["timeline", "materials", "labor", "issues"].includes(activeTab) && (
        <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
          {!editing ? (
            <button className="button" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }} onClick={startEdit} disabled={updates.length === 0 && !job?.parsed}>
              <Pencil size={13} strokeWidth={1.75} />
              Edit
            </button>
          ) : (
            <>
              <button className="button" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }} onClick={cancelEdit} disabled={savingEdit}>
                <X size={13} strokeWidth={1.75} />
                Cancel
              </button>
              <button className="button primary" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }} onClick={saveEdit} disabled={savingEdit}>
                <Save size={13} strokeWidth={1.75} />
                {savingEdit ? "Saving…" : "Save changes"}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Timeline ── */}
      {activeTab === "timeline" && (
        <section className="panel">
          <div className="panel-body">
            {timeline.length === 0 ? (
              <div style={{ color: "#888", fontSize: 14 }}>
                <p style={{ margin: "0 0 8px" }}>No timeline events yet.</p>
                <a href={`/company/field?jobId=${jobId}${preview ? `&preview=${preview}` : ""}`} className="button" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <ExternalLink size={13} strokeWidth={1.75} />
                  Submit a field update
                </a>
              </div>
            ) : editing ? (
              <div style={{ display: "grid", gap: 8 }}>
                {timeline.map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <InlineInput value={t.time ?? ""} onChange={(v) => mutate(p => { p.timeline[i].time = v; })} placeholder="time" width={70} />
                    <InlineInput value={t.description} onChange={(v) => mutate(p => { p.timeline[i].description = v; })} placeholder="What happened" />
                    <button className="no-print" onClick={() => mutate(p => { p.timeline.splice(i, 1); })} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16 }} title="Remove">×</button>
                  </div>
                ))}
                <button className="no-print" onClick={() => mutate(p => { p.timeline.push({ description: "" }); })} style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Plus size={13} strokeWidth={1.75} />
                  Add event
                </button>
              </div>
            ) : (
              <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
                {timeline.map((t, i) => (
                  <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span style={{ minWidth: 24, height: 24, borderRadius: "50%", background: "#e0e7ff", color: "#3730a3", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                    <div>
                      {(t.time || (timelineMultiDay && t.dateMs)) && (
                        <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, display: "block" }}>
                          {timelineMultiDay && t.dateMs ? fmtDay(t.dateMs) : ""}
                          {timelineMultiDay && t.dateMs && t.time ? " · " : ""}
                          {t.time ?? ""}
                        </span>
                      )}
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
            {materials.length === 0 && !editing ? (
              <div style={{ color: "#888", fontSize: 14, padding: 20 }}>
                <p style={{ margin: "0 0 8px" }}>No materials extracted yet.</p>
                <a href={`/company/field?jobId=${jobId}${preview ? `&preview=${preview}` : ""}`} className="button" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <ExternalLink size={13} strokeWidth={1.75} />
                  Submit a field update
                </a>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Item</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Qty</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Unit</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "#64748b" }}>Cost</th>
                    {editing && <th className="no-print" />}
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      {editing ? (
                        <>
                          <td style={{ padding: "8px 16px" }}><InlineInput value={m.item} onChange={(v) => mutate(p => { p.materials[i].item = v; })} placeholder="Item" /></td>
                          <td style={{ padding: "8px 16px" }}><InlineInput value={m.quantity ?? ""} onChange={(v) => mutate(p => { p.materials[i].quantity = v; })} placeholder="0" /></td>
                          <td style={{ padding: "8px 16px" }}><InlineInput value={m.unit ?? ""} onChange={(v) => mutate(p => { p.materials[i].unit = v; })} placeholder="unit" /></td>
                          <td style={{ padding: "8px 16px", textAlign: "right" }}>$<InlineInput value={m.cost != null ? String(m.cost) : ""} onChange={(v) => mutate(p => { const n = parseFloat(v); if (Number.isFinite(n)) p.materials[i].cost = n; else delete p.materials[i].cost; })} placeholder="0.00" align="right" width={64} /></td>
                          <td className="no-print" style={{ padding: "8px 8px", textAlign: "right" }}><button onClick={() => mutate(p => { p.materials.splice(i, 1); })} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16 }} title="Remove">×</button></td>
                        </>
                      ) : (
                        <>
                          <td style={{ padding: "10px 16px" }}>{m.item}</td>
                          <td style={{ padding: "10px 16px", color: "#64748b" }}>{m.quantity ?? "—"}</td>
                          <td style={{ padding: "10px 16px", color: "#64748b" }}>{m.unit ?? "—"}</td>
                          <td style={{ padding: "10px 16px", textAlign: "right", color: "#64748b" }}>{m.cost != null ? `$${m.cost.toFixed(2)}` : "—"}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {editing && (
              <button className="no-print" onClick={() => mutate(p => { p.materials.push({ item: "", quantity: "1", unit: "" }); })} style={{ margin: "10px 16px", fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Plus size={13} strokeWidth={1.75} />
                Add material
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── Labor ── */}
      {activeTab === "labor" && (
        <section className="panel">
          <div className="panel-body" style={{ padding: 0 }}>
            {labor.length === 0 && !editing ? (
              <div style={{ color: "#888", fontSize: 14, padding: 20 }}>
                <p style={{ margin: "0 0 8px" }}>No labor extracted yet.</p>
                <a href={`/company/field?jobId=${jobId}${preview ? `&preview=${preview}` : ""}`} className="button" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <ExternalLink size={13} strokeWidth={1.75} />
                  Submit a field update
                </a>
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
                    {editing && <th className="no-print" />}
                  </tr>
                </thead>
                <tbody>
                  {labor.map((l, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      {editing ? (
                        <>
                          <td style={{ padding: "8px 16px" }}><InlineInput value={l.description} onChange={(v) => mutate(p => { p.labor[i].description = v; })} placeholder="Name" /></td>
                          <td style={{ padding: "8px 16px" }}><InlineInput value={l.arrivalTime ?? ""} onChange={(v) => mutate(p => { p.labor[i].arrivalTime = v; })} placeholder="8:00 AM" /></td>
                          <td style={{ padding: "8px 16px" }}><InlineInput value={l.departureTime ?? ""} onChange={(v) => mutate(p => { p.labor[i].departureTime = v; })} placeholder="4:00 PM" /></td>
                          <td style={{ padding: "8px 16px", textAlign: "right" }}><InlineInput value={l.hours != null ? String(l.hours) : ""} onChange={(v) => mutate(p => { const n = parseFloat(v); if (Number.isFinite(n)) p.labor[i].hours = n; else delete p.labor[i].hours; })} placeholder="0" align="right" width={48} /></td>
                          <td style={{ padding: "8px 16px", textAlign: "right" }}>$<InlineInput value={l.rate != null ? String(l.rate) : ""} onChange={(v) => mutate(p => { const n = parseFloat(v); if (Number.isFinite(n)) p.labor[i].rate = n; else delete p.labor[i].rate; })} placeholder={defaultLaborRate} align="right" width={48} /></td>
                          <td className="no-print" style={{ padding: "8px 8px", textAlign: "right" }}><button onClick={() => mutate(p => { p.labor.splice(i, 1); })} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16 }} title="Remove">×</button></td>
                        </>
                      ) : (
                        <>
                          <td style={{ padding: "10px 16px", fontWeight: 600 }}>{l.description}</td>
                          <td style={{ padding: "10px 16px", color: "#64748b" }}>{l.arrivalTime ?? "—"}</td>
                          <td style={{ padding: "10px 16px", color: "#64748b" }}>{l.departureTime ?? "—"}</td>
                          <td style={{ padding: "10px 16px", textAlign: "right", color: "#64748b" }}>{l.hours ?? "—"}</td>
                          <td style={{ padding: "10px 16px", textAlign: "right", color: "#64748b" }}>{l.rate != null ? `$${l.rate}/hr` : "—"}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {editing && (
              <button className="no-print" onClick={() => mutate(p => { p.labor.push({ description: "" }); })} style={{ margin: "10px 16px", fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Plus size={13} strokeWidth={1.75} />
                Add technician
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── Issues ── */}
      {activeTab === "issues" && (
        <section className="panel">
          <div className="panel-body">
            {issues.length === 0 && !editing ? (
              <div style={{ color: "#888", fontSize: 14 }}>
                <p style={{ margin: "0 0 8px" }}>No issues extracted yet.</p>
                <a href={`/company/field?jobId=${jobId}${preview ? `&preview=${preview}` : ""}`} className="button" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <ExternalLink size={13} strokeWidth={1.75} />
                  Submit a field update
                </a>
              </div>
            ) : editing ? (
              <div style={{ display: "grid", gap: 8 }}>
                {issues.map((issue, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", borderRadius: 8, background: SEVERITY_COLOR[issue.severity] + "10", borderLeft: `3px solid ${SEVERITY_COLOR[issue.severity]}` }}>
                    <select value={issue.severity} onChange={(e) => mutate(p => { p.issues[i].severity = e.target.value as "low" | "medium" | "high"; })} style={{ fontSize: 12, padding: "2px 6px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                      <option value="low">low</option>
                      <option value="medium">medium</option>
                      <option value="high">high</option>
                    </select>
                    <InlineInput value={issue.description} onChange={(v) => mutate(p => { p.issues[i].description = v; })} placeholder="Issue description" />
                    <button className="no-print" onClick={() => mutate(p => { p.issues.splice(i, 1); })} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16 }} title="Remove">×</button>
                  </div>
                ))}
                <button className="no-print" onClick={() => mutate(p => { p.issues.push({ description: "", severity: "medium" }); })} style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Plus size={13} strokeWidth={1.75} />
                  Add issue
                </button>
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

      {/* ── Photos ── */}
      {activeTab === "photos" && (
        <section className="panel">
          <div className="panel-body">
            {!photosLoaded ? (
              <p style={{ color: "#888", fontSize: 14 }}>Loading photos…</p>
            ) : photos.length === 0 ? (
              <div style={{ color: "#888", fontSize: 14 }}>
                <p style={{ margin: "0 0 8px" }}>No photos yet.</p>
                <a href={`/company/field?jobId=${jobId}${preview ? `&preview=${preview}` : ""}`} className="button" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <ExternalLink size={13} strokeWidth={1.75} />
                  Add from field
                </a>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 14px" }}>Tap a photo to view full size. Toggle &ldquo;In report&rdquo; to include it in the generated report (max 2 pages).</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 14 }}>
                  {photos.map((ph) => (
                    <div key={ph.photoId} style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                      <img
                        src={`data:image/jpeg;base64,${ph.thumbB64}`}
                        alt={ph.label}
                        onClick={() => openLightbox(ph)}
                        style={{ width: "100%", height: 120, objectFit: "cover", cursor: "pointer", display: "block" }}
                      />
                      <div style={{ padding: "8px 10px" }}>
                        <p style={{ margin: "0 0 6px", fontSize: 12, color: "#334155", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{ph.label}</p>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#475569", cursor: "pointer" }}>
                            <input type="checkbox" checked={!!ph.includeInReport} onChange={() => toggleInclude(ph)} />
                            In report
                          </label>
                          <button onClick={() => { if (confirm("Delete this photo?")) deletePhoto(ph); }} title="Delete" aria-label={`Delete ${ph.label}`} className="icon-del">
                            <Trash2 size={15} strokeWidth={1.75} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* Lightbox popup */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.85)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
          {lightbox.fullB64 ? (
            <img src={`data:image/jpeg;base64,${lightbox.fullB64}`} alt={lightbox.label} style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: 8 }} />
          ) : (
            <div style={{ color: "#94a3b8", fontSize: 14 }}>Loading…</div>
          )}
          <p style={{ color: "#fff", fontSize: 14, marginTop: 16, maxWidth: 600, textAlign: "center" }}>{lightbox.label}</p>
          <button onClick={() => setLightbox(null)} style={{ position: "absolute", top: 20, right: 24, background: "none", border: "none", color: "#fff", fontSize: 28, cursor: "pointer" }}>×</button>
        </div>
      )}

      {/* Field QR popup */}
      {qrOpen && (
        <div onClick={() => setQrOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 28, maxWidth: 320, width: "100%", textAlign: "center", position: "relative" }}>
            <button onClick={() => setQrOpen(false)} aria-label="Close" style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}>
              <X size={18} strokeWidth={1.75} />
            </button>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>Scan to log this job</h2>
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 16px" }}>No portal login needed — hand this to a crew member on-site.</p>
            {qrLoading ? (
              <div style={{ width: 220, height: 220, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9", borderRadius: 8, fontSize: 13, color: "#94a3b8" }}>
                Generating…
              </div>
            ) : qrError ? (
              <div style={{ width: 220, height: 220, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", background: "#fef2f2", borderRadius: 8, fontSize: 13, color: "#b91c1c", padding: 16 }} role="alert">
                {qrError}
              </div>
            ) : (
              <img src={qrDataUrl} alt="Field access QR code" style={{ width: 220, height: 220, display: "block", margin: "0 auto", borderRadius: 8, border: "1px solid #e2e8f0" }} />
            )}
            {qrExpiresAt && !qrLoading && !qrError && (
              <p style={{ fontSize: 11, color: "#94a3b8", margin: "12px 0 0" }}>
                Expires {new Date(qrExpiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} — one scan only
              </p>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center" }}>
              {qrFieldUrl && !qrLoading && (
                <button className="button" style={{ fontSize: 12 }} onClick={() => {
                  navigator.clipboard.writeText(qrFieldUrl).then(() => { setQrLinkCopied(true); setTimeout(() => setQrLinkCopied(false), 2500); }).catch(() => prompt("Copy this link:", qrFieldUrl));
                }}>
                  {qrLinkCopied ? "Link copied" : "Copy link instead"}
                </button>
              )}
              <button className="button" style={{ fontSize: 12 }} onClick={openFieldQr} disabled={qrLoading}>
                <RefreshCw size={13} strokeWidth={1.75} style={{ marginRight: 4 }} />
                {qrError ? "Try again" : "New code"}
              </button>
            </div>
          </div>
        </div>
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
                  <button className="button primary" onClick={generateInvoice} disabled={generatingInvoice} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Receipt size={15} strokeWidth={1.75} />
                    {generatingInvoice ? "Building…" : "Generate Invoice"}
                  </button>
                )}
              </div>
            </section>
          ) : (
            <div style={{ maxWidth: 780, margin: "0 auto" }}>
              {/* Invoice toolbar */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12, flexWrap: "wrap" }} className="no-print">
                <button className="button" onClick={() => { setShowSendPanel(p => !p); setSendSuccess(false); setSendError(null); }} style={{ fontSize: 13, background: showSendPanel ? "#eff6ff" : undefined, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Send size={14} strokeWidth={1.75} />
                  Send to Customer
                </button>
                <button className="button" onClick={() => window.print()} style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Printer size={14} strokeWidth={1.75} />
                  Print / Save as PDF
                </button>
                <button className="button" onClick={() => setInvoiceReady(false)} style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <RefreshCw size={14} strokeWidth={1.75} />
                  Regenerate
                </button>
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
                      <button onClick={sendInvoice} disabled={sending} className="button primary" style={{ fontSize: 13, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Send size={14} strokeWidth={1.75} />
                        {sending ? "Sending…" : "Send Invoice"}
                      </button>
                    </div>
                  )}
                  {sendError && <p style={{ margin: "8px 0 0", color: "#b91c1c", fontSize: 13 }}>{sendError}</p>}
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b" }}>Sends the current invoice totals as a draft. Customer can reply to discuss.</p>
                </div>
              )}

              {/* Invoice document */}
              <div className="invoice-doc" style={{
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
                    <button className="no-print" onClick={() => setLaborRows(r => [...r, { name: "", arrival: "", departure: "", hours: "", rate: defaultLaborRate }])} style={{ marginTop: 6, fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <Plus size={13} strokeWidth={1.75} />
                      Add technician
                    </button>
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
                  <button className="no-print" onClick={() => setMaterialRows(r => [...r, { item: "", quantity: "1", unit: "", unitPrice: "" }])} style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Plus size={13} strokeWidth={1.75} />
                    Add material
                  </button>
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
                <button className="no-print" onClick={() => setOtherRows(r => [...r, { description: "", amount: "" }])} style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: "0 0 24px", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Plus size={13} strokeWidth={1.75} />
                  Add other charge (disposal, permit, etc.)
                </button>

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
                  <button className="button" onClick={generateReport} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <FileText size={15} strokeWidth={1.75} />
                    Generate Report
                  </button>
                )}
              </div>
            </section>
          ) : (
            <div style={{ maxWidth: 720, margin: "0 auto" }}>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12, flexWrap: "wrap" }} className="no-print">
                <button className="button" onClick={() => { setShowReportSend((s) => !s); setReportSent(false); setReportSendError(null); if (!reportTo && job?.clientEmail) setReportTo(job.clientEmail); }} style={{ fontSize: 13, background: showReportSend ? "#eff6ff" : undefined, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Send size={14} strokeWidth={1.75} />
                  Mail report
                </button>
                <button className="button" onClick={() => window.print()} style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Printer size={14} strokeWidth={1.75} />
                  Print / Save as PDF
                </button>
                <button className="button" onClick={() => { setReport(null); setTimeout(generateReport, 0); }} style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <RefreshCw size={14} strokeWidth={1.75} />
                  Regenerate
                </button>
              </div>

              {/* Mail panel — automation prepares the report; a human presses send */}
              {showReportSend && (
                <div style={{ marginBottom: 16, padding: "16px 20px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10 }} className="no-print">
                  <p style={{ margin: "0 0 10px", fontWeight: 600, fontSize: 14, color: "#0369a1" }}>Email this report to the client</p>
                  {reportSent ? (
                    <p style={{ margin: 0, color: "#15803d", fontWeight: 600 }}>✓ Report sent successfully!</p>
                  ) : (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <input type="email" value={reportTo} onChange={(e) => setReportTo(e.target.value)} placeholder={job?.clientName ? `Email for ${job.clientName}` : "client@email.com"} style={{ flex: 1, minWidth: 200, padding: "9px 12px", borderRadius: 8, border: "1.5px solid #bae6fd", fontSize: 14, outline: "none" }} />
                      <button onClick={mailReport} disabled={reportSending} className="button primary" style={{ fontSize: 13, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Send size={14} strokeWidth={1.75} />
                        {reportSending ? "Sending…" : "Send report"}
                      </button>
                    </div>
                  )}
                  {reportSendError && <p style={{ margin: "8px 0 0", color: "#b91c1c", fontSize: 13 }}>{reportSendError}</p>}
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b" }}>Includes the notes and any photos marked &ldquo;In report&rdquo;.</p>
                </div>
              )}

              {/* Scope & Resolution notes — admin-edited, persisted, included in the report */}
              <div style={{ marginBottom: 16 }} className="no-print">
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>Scope &amp; Resolution notes</label>
                <textarea value={reportNotes} onChange={(e) => setReportNotes(e.target.value)} onBlur={saveReportNotes} rows={3} placeholder="Summarize the issue identified and the repair applied — this appears in the report." style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 14, lineHeight: 1.6, resize: "vertical", outline: "none", fontFamily: "inherit" }} />
              </div>

              <ReportRenderer report={report} job={job} jobId={jobId} businessConfig={businessConfig} allParsed={allParsed} reportNotes={reportNotes} reportPhotos={reportPhotos} />
            </div>
          )}
        </div>
      )}

      {/* Field updates — parsed summary cards */}
      <section className="panel no-print" style={{ marginTop: 20 }}>
        <div className="panel-header">
          <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ClipboardList size={16} strokeWidth={1.75} />
            Field Updates ({updates.length})
          </h2>
          <a className="button" href={`/company/field?jobId=${jobId}${preview ? `&preview=${preview}` : ""}`} style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <ExternalLink size={13} strokeWidth={1.75} />
            Submit update
          </a>
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

  // Correction entries: render a compact audit line instead of the parsed grid.
  if (update.kind === "correction") {
    return (
      <div style={{ padding: "12px 16px", background: "#faf5ff", borderRadius: 10, border: "1px solid #e9d5ff", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", background: "#f3e8ff", border: "1px solid #e9d5ff", borderRadius: 4, padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Correction</span>
        <span style={{ fontSize: 13, color: "#1e293b", textTransform: "capitalize" }}>
          {update.correctionItem} → <strong>{update.correctionNewValue}</strong>
        </span>
        {update.submittedBy && <span style={{ fontSize: 12, color: "#94a3b8" }}>by {update.submittedBy}</span>}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>
          {new Date(update.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </span>
      </div>
    );
  }

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

// ── Professional branded report renderer ────────────────────────────────────────
function ReportRenderer({
  job, jobId, businessConfig, allParsed, reportNotes, reportPhotos,
}: {
  report: string;
  job: Job;
  jobId: string;
  businessConfig: BusinessConfig | null;
  allParsed: ParsedUpdate[];
  reportNotes?: string;
  reportPhotos?: Array<{ label: string; fullB64: string }>;
}) {
  const accent = businessConfig?.brandColor ?? "#1e3a5f";
  const bizName = businessConfig?.businessName ?? "Field Report";
  const logoUrl = businessConfig?.logoUrl;
  const contactPhone = businessConfig?.contactPhone;
  const contactEmail = businessConfig?.contactEmail;
  const website = businessConfig?.websiteUrl;

  const timeline = allParsed.flatMap((p) => p.timeline);
  const timelineMultiDay = new Set(timeline.map((t) => (t.dateMs ? new Date(t.dateMs).toDateString() : "")).filter(Boolean)).size > 1;
  const fmtDay = (ms?: number) => (ms ? new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
  const materials = allParsed.flatMap((p) => p.materials);
  const labor = allParsed.flatMap((p) => p.labor);
  const issues = allParsed.flatMap((p) => p.issues);

  const highIssues = issues.filter((i) => i.severity === "high");
  const medIssues  = issues.filter((i) => i.severity === "medium");
  const lowIssues  = issues.filter((i) => i.severity === "low");

  const totalLaborHours = labor.reduce((s, l) => s + (l.hours ?? 0), 0);
  const defaultRate = businessConfig?.laborRate?.defaultHourlyRate ?? 65;
  const laborCost = labor.reduce((s, l) => s + ((l.hours ?? 0) * (l.rate ?? defaultRate)), 0);
  const materialCost = materials.reduce((s, m) => s + (m.cost ?? 0), 0);

  const reportDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const jobDate = new Date(job.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const statusLabel: Record<string, string> = {
    open: "Inspection", inspection: "Inspection", quoted: "Quoted",
    in_progress: "In Progress", invoiced: "Invoiced", complete: "Complete",
  };

  const SEV_COLOR: Record<string, { bg: string; border: string; text: string; label: string }> = {
    high:   { bg: "#fef2f2", border: "#fca5a5", text: "#b91c1c", label: "HIGH PRIORITY" },
    medium: { bg: "#fffbeb", border: "#fcd34d", text: "#92400e", label: "MEDIUM" },
    low:    { bg: "#f0fdf4", border: "#86efac", text: "#15803d", label: "LOW" },
  };

  return (
    <div className="report-doc" style={{
      background: "#fff",
      border: "1px solid #e2e8f0",
      borderRadius: 12,
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      color: "#1e293b",
      boxShadow: "0 4px 32px rgba(0,0,0,0.08)",
      overflow: "hidden",
    }}>

      {/* ── Branded header bar ── */}
      <div style={{
        background: accent,
        padding: "28px 40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {logoUrl && (
            <img src={logoUrl} alt={bizName} style={{ height: 44, objectFit: "contain", filter: "brightness(0) invert(1)", maxWidth: 120 }} />
          )}
          <div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 2 }}>Job Report</div>
            <div style={{ color: "#fff", fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>{bizName}</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginBottom: 2 }}>Generated</div>
          <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{reportDate}</div>
        </div>
      </div>

      <div style={{ padding: "32px 40px" }}>

        {/* ── Job summary card ── */}
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "20px 24px", marginBottom: 28, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 32px" }}>
          <MetaRow label="Job ID" value={jobId} mono />
          <MetaRow label="Status" value={statusLabel[job.status] ?? job.status} />
          {job.clientName && <MetaRow label="Client" value={job.clientName} />}
          {job.clientPhone && <MetaRow label="Phone" value={job.clientPhone} />}
          {job.address && <MetaRow label="Address" value={job.address} span />}
          {job.serviceType && <MetaRow label="Service" value={job.serviceType} />}
          <MetaRow label="Job opened" value={jobDate} />
          {(totalLaborHours > 0 || materialCost > 0) && (
            <MetaRow label="Est. cost" value={`$${(laborCost + materialCost).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
          )}
        </div>

        {/* ── Executive summary ── */}
        {issues.length > 0 && (
          <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "16px 20px", marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#0369a1", marginBottom: 8 }}>Summary</div>
            <p style={{ margin: 0, fontSize: 14, color: "#0c4a6e", lineHeight: 1.65 }}>
              {highIssues.length > 0 && `${highIssues.length} high-priority issue${highIssues.length > 1 ? "s" : ""} identified requiring immediate attention. `}
              {medIssues.length > 0 && `${medIssues.length} medium-priority item${medIssues.length > 1 ? "s" : ""} noted. `}
              {lowIssues.length > 0 && `${lowIssues.length} minor item${lowIssues.length > 1 ? "s" : ""} logged. `}
              {timeline.length > 0 && `${timeline.length} work step${timeline.length > 1 ? "s" : ""} completed on site. `}
              {materials.length > 0 && `${materials.length} material${materials.length > 1 ? "s" : ""} used. `}
              {totalLaborHours > 0 && `Total labor: ${totalLaborHours.toFixed(1)} hours.`}
            </p>
          </div>
        )}

        {/* ── Scope & resolution (admin notes) ── */}
        {reportNotes?.trim() && (
          <ReportSection title="Scope & Resolution">
            <p style={{ margin: 0, fontSize: 14, color: "#334155", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{reportNotes.trim()}</p>
          </ReportSection>
        )}

        {/* ── Issues identified ── */}
        {issues.length > 0 && (
          <ReportSection title="Issues Identified">
            <div style={{ display: "grid", gap: 10 }}>
              {issues.map((issue, i) => {
                const sev = SEV_COLOR[issue.severity] ?? SEV_COLOR.low;
                return (
                  <div key={i} style={{ padding: "12px 16px", background: sev.bg, border: `1px solid ${sev.border}`, borderLeft: `4px solid ${sev.border}`, borderRadius: 8, display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: sev.text, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap", marginTop: 2 }}>{sev.label}</span>
                    <span style={{ fontSize: 14, color: "#1e293b", lineHeight: 1.5 }}>{issue.description}</span>
                  </div>
                );
              })}
            </div>
          </ReportSection>
        )}

        {/* ── Work performed ── */}
        {timeline.length > 0 && (
          <ReportSection title="Work Performed">
            <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
              {timeline.map((t, i) => (
                <li key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <span style={{ minWidth: 26, height: 26, borderRadius: "50%", background: accent, color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                  <div>
                    {(t.time || (timelineMultiDay && t.dateMs)) && (
                      <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 2 }}>
                        {timelineMultiDay && t.dateMs ? fmtDay(t.dateMs) : ""}
                        {timelineMultiDay && t.dateMs && t.time ? " · " : ""}
                        {t.time ?? ""}
                      </div>
                    )}
                    <div style={{ fontSize: 14, color: "#1e293b", lineHeight: 1.55 }}>{t.description}</div>
                  </div>
                </li>
              ))}
            </ol>
          </ReportSection>
        )}

        {/* ── Materials used ── */}
        {materials.length > 0 && (
          <ReportSection title="Materials Used">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={thStyle()}>Item</th>
                  <th style={thStyle()}>Qty</th>
                  <th style={thStyle()}>Unit</th>
                  <th style={thStyle("right")}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={tdStyle()}>{m.item}</td>
                    <td style={{ ...tdStyle(), color: "#64748b" }}>{m.quantity ?? "—"}</td>
                    <td style={{ ...tdStyle(), color: "#64748b" }}>{m.unit ?? "—"}</td>
                    <td style={{ ...tdStyle("right"), color: "#64748b" }}>{m.cost != null ? `$${m.cost.toFixed(2)}` : "—"}</td>
                  </tr>
                ))}
                {materialCost > 0 && (
                  <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc" }}>
                    <td colSpan={3} style={{ ...tdStyle(), fontWeight: 700 }}>Materials total</td>
                    <td style={{ ...tdStyle("right"), fontWeight: 700 }}>${materialCost.toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </ReportSection>
        )}

        {/* ── Labor summary ── */}
        {labor.length > 0 && (
          <ReportSection title="Labor Summary">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={thStyle()}>Technician</th>
                  <th style={thStyle()}>In</th>
                  <th style={thStyle()}>Out</th>
                  <th style={thStyle("right")}>Hours</th>
                  <th style={thStyle("right")}>Rate</th>
                  <th style={thStyle("right")}>Total</th>
                </tr>
              </thead>
              <tbody>
                {labor.map((l, i) => {
                  const hrs = l.hours ?? 0;
                  const rate = l.rate ?? defaultRate;
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ ...tdStyle(), fontWeight: 600 }}>{l.description}</td>
                      <td style={{ ...tdStyle(), color: "#64748b" }}>{l.arrivalTime ?? "—"}</td>
                      <td style={{ ...tdStyle(), color: "#64748b" }}>{l.departureTime ?? "—"}</td>
                      <td style={{ ...tdStyle("right"), color: "#64748b" }}>{hrs > 0 ? `${hrs}h` : "—"}</td>
                      <td style={{ ...tdStyle("right"), color: "#64748b" }}>{l.rate != null ? `$${l.rate}/hr` : `$${defaultRate}/hr`}</td>
                      <td style={{ ...tdStyle("right"), color: "#64748b" }}>{hrs > 0 ? `$${(hrs * rate).toFixed(2)}` : "—"}</td>
                    </tr>
                  );
                })}
                {laborCost > 0 && (
                  <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc" }}>
                    <td colSpan={3} style={{ ...tdStyle(), fontWeight: 700 }}>Labor total</td>
                    <td style={{ ...tdStyle("right"), fontWeight: 700 }}>{totalLaborHours.toFixed(1)}h</td>
                    <td />
                    <td style={{ ...tdStyle("right"), fontWeight: 700 }}>${laborCost.toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </ReportSection>
        )}

        {/* ── Cost estimate ── */}
        {(laborCost > 0 || materialCost > 0) && (
          <div style={{ background: "#f8fafc", border: `2px solid ${accent}22`, borderRadius: 10, padding: "16px 24px", marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#64748b", marginBottom: 12 }}>Cost Estimate</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {laborCost > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><span>Labor</span><span style={{ fontWeight: 600 }}>${laborCost.toFixed(2)}</span></div>}
              {materialCost > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><span>Materials</span><span style={{ fontWeight: 600 }}>${materialCost.toFixed(2)}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, borderTop: `1px solid ${accent}33`, paddingTop: 8, marginTop: 4, color: accent }}>
                <span>Estimated Total</span>
                <span>${(laborCost + materialCost).toFixed(2)}</span>
              </div>
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 11, color: "#94a3b8" }}>Estimate only. Final invoice may differ based on additional scope.</p>
          </div>
        )}

        {/* ── Photo documentation (max 2 pages: up to 8 photos, 4 per page) ── */}
        {reportPhotos && reportPhotos.length > 0 && (
          <div style={{ pageBreakBefore: "always", marginTop: 8 }}>
            <ReportSection title="Photo Documentation">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {reportPhotos.slice(0, 8).map((ph, i) => (
                  <div key={i} style={{ breakInside: "avoid" }}>
                    <img src={`data:image/jpeg;base64,${ph.fullB64}`} alt={ph.label} style={{ width: "100%", height: 200, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0" }} />
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: "#475569", lineHeight: 1.4 }}>{ph.label}</p>
                  </div>
                ))}
              </div>
            </ReportSection>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{bizName}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, display: "flex", gap: 12, flexWrap: "wrap" }}>
              {contactPhone && <span>{contactPhone}</span>}
              {contactEmail && <span>{contactEmail}</span>}
              {website && <span>{website}</span>}
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "right" }}>
            <div>Generated by Luxor AI</div>
            <div>{reportDate}</div>
          </div>
        </div>

      </div>
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#475569", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
        <span>{title}</span>
        <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
      </div>
      {children}
    </div>
  );
}

function MetaRow({ label, value, mono, span }: { label: string; value: string; mono?: boolean; span?: boolean }) {
  return (
    <div style={{ gridColumn: span ? "1 / -1" : undefined }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", fontFamily: mono ? "monospace" : undefined }}>{value}</div>
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
