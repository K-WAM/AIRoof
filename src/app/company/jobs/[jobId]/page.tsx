"use client";

import { use, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useFormat } from "@/hooks/useFormat";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { buildProjection } from "@/lib/jobs/projection";
import type { Job, FieldUpdate, ParsedUpdate, JobPhotoMeta, PhotoPhase } from "@/types/jobs";
import type { LibraryPricing, LibraryLogo } from "@/types/library";
import { pickDefaultLogo, logoDataUri, logoStyle, needsLogoChip } from "@/lib/branding/logo";
import type { BusinessConfig } from "@/types";
import type { JobInvoice, InvoiceLaborLine, InvoiceMaterialLine, InvoiceOtherLine } from "@/types/invoice";
import { computeTotals, canSendInvoice } from "./jobInvoice";
import { invoiceGroups } from "@/lib/documents/groups";
import { resolveLetterhead } from "@/lib/documents/letterhead";
import { DocumentPreview } from "@/lib/documents/DocumentPreview";
import { normalizeDocumentOptions, type DocumentOptions } from "@/types/documentOptions";
import { draftReportNotes, pairReportPhotos, reportSections } from "@/lib/documents/report";
import { FindingsPanel } from "./FindingsPanel";
import { JobHistory } from "./JobHistory";
import { jobSteps } from "@/lib/jobs/nextStep";
import { useWorkCatalog } from "@/hooks/useWorkCatalog";
import { pollJobOnce } from "@/lib/jobs/livePoll";
import { DocumentOptionToggles } from "@/components/documents/DocumentOptionToggles";
import { OPTIONS_HEADING } from "@/lib/documents/optionsCopy";
import { draftWorkDescription } from "@/lib/documents/workSummary";
import { QuotePanel } from "./QuotePanel";
import { NextStepButton } from "./NextStepButton";
import { LockNote } from "./LockNote";
import type { JobQuote } from "@/types/quote";
import { reportFindings } from "@/lib/jobs/findings";
import { runSingleFlight, guardUnsavedInvoiceUnload } from "@/app/admin/invoices/invoiceFlow";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Toggle } from "@/components/ui/Toggle";
import { Tooltip } from "@/components/ui/Tooltip";
import { PhotoEditSheet } from "@/components/field/PhotoEditSheet";
import { useQuickAdd } from "@/contexts/QuickAddContext";
import { useQuickAddRefresh } from "@/lib/events/quickAdd";
import {
  AlertCircle,
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

// Phase 12, Phase 3 — report photo grid. Raised 8 → 16 (2 pages @ 8/page).
const MAX_REPORT_PHOTOS = 12;
const PHASE_ORDER: PhotoPhase[] = ["before", "after", "other"];

type ReportPhoto = { label: string; fullB64: string; phase?: PhotoPhase };

/**
 * Group already-sorted (before → after → other) photos and insert an invisible spacer between
 * groups so a phase boundary always lands on a fresh row — 3 "before" photos followed directly
 * by "after" photos would otherwise put the last "before" mid-row, which reads as a rendering
 * error rather than an intentional section break.
 */
function groupAndPadForGrid(photos: ReportPhoto[], columns = 2): Array<ReportPhoto | { spacer: true }> {
  const groups = PHASE_ORDER
    .map((phase) => photos.filter((p) => (p.phase ?? "other") === phase))
    .filter((g) => g.length > 0);
  const out: Array<ReportPhoto | { spacer: true }> = [];
  groups.forEach((group, i) => {
    out.push(...group);
    const isLastGroup = i === groups.length - 1;
    if (!isLastGroup && out.length % columns !== 0) out.push({ spacer: true });
  });
  return out;
}

type LaborRow = { lineId?: string; source?: InvoiceLaborLine["source"]; name: string; arrival: string; departure: string; hours: string; rate: string };
type MaterialRow = { lineId?: string; source?: InvoiceMaterialLine["source"]; item: string; quantity: string; unit: string; unitPrice: string };
type OtherRow = { lineId?: string; description: string; amount: string };

// Invoice persistence (Phase 12, Phase 4) row <-> line adapters. The editable rows above are
// plain strings (bound directly to text inputs); InvoiceLaborLine/InvoiceMaterialLine/
// InvoiceOtherLine are the persisted, numeric shape. Keep line IDs and source through edits so
// a repeat finding import remains idempotent and crew provenance survives an autosave.
function laborRowsToLines(rows: LaborRow[]): InvoiceLaborLine[] {
  return rows.map((r, i) => {
    const hours = parseFloat(r.hours) || 0;
    const rate = parseFloat(r.rate) || 0;
    return { lineId: r.lineId ?? `lab_${i}`, name: r.name, arrival: r.arrival || undefined, departure: r.departure || undefined, hours, rate, total: hours * rate, source: r.source ?? "manual" };
  });
}
function materialRowsToLines(rows: MaterialRow[]): InvoiceMaterialLine[] {
  return rows.map((r, i) => {
    const quantity = parseFloat(r.quantity) || 0;
    const unitPrice = parseFloat(r.unitPrice) || 0;
    return { lineId: r.lineId ?? `mat_${i}`, item: r.item, quantity, unit: r.unit || undefined, unitPrice, total: quantity * unitPrice, source: r.source ?? "manual" };
  });
}
function otherRowsToLines(rows: OtherRow[]): InvoiceOtherLine[] {
  return rows.map((r, i) => ({ lineId: r.lineId ?? `oth_${i}`, description: r.description, amount: parseFloat(r.amount) || 0 }));
}
function laborLinesToRows(lines: InvoiceLaborLine[]): LaborRow[] {
  return lines.map((l) => ({ lineId: l.lineId, source: l.source, name: l.name, arrival: l.arrival ?? "", departure: l.departure ?? "", hours: l.hours ? String(l.hours) : "", rate: String(l.rate) }));
}
function materialLinesToRows(lines: InvoiceMaterialLine[]): MaterialRow[] {
  return lines.map((m) => ({ lineId: m.lineId, source: m.source, item: m.item, quantity: String(m.quantity), unit: m.unit ?? "", unitPrice: m.unitPrice ? String(m.unitPrice) : "" }));
}
function otherLinesToRows(lines: InvoiceOtherLine[]): OtherRow[] {
  return lines.map((o) => ({ lineId: o.lineId, description: o.description, amount: String(o.amount) }));
}

export default function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const searchParams = useSearchParams();
  const hookBusinessId = useBusinessId();
  const businessId = searchParams?.get("businessId") ?? hookBusinessId;
  const preview = searchParams?.get("preview");
  const previewSuffix = preview ? `?preview=${preview}` : "";
  const { open: openQuickAdd } = useQuickAdd();
  // Business-timezone formatters ("Sep 25, 8:59 PM") — the same format as Calls and Pipeline, never the browser locale.
  const fmt = useFormat();
  // The Library catalog is loaded once here and shared by the Findings and Quote tabs.
  const catalog = useWorkCatalog(businessId);

  const [job, setJob] = useState<Job | null>(null);
  const [updates, setUpdates] = useState<FieldUpdate[]>([]);
  const [businessConfig, setBusinessConfig] = useState<BusinessConfig | null>(null);
  const [logos, setLogos] = useState<LibraryLogo[]>([]);
  const [library, setLibrary] = useState<LibraryPricing | null>(null);
  const [libraryLoadFailed, setLibraryLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"timeline" | "materials" | "labor" | "findings" | "photos" | "invoice" | "quote" | "report">("timeline");
  const [pageQuote, setPageQuote] = useState<JobQuote | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
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
  const [editingPhoto, setEditingPhoto] = useState<JobPhotoMeta | null>(null);
  const [lightbox, setLightbox] = useState<{ photoId: string; label: string; fullB64?: string } | null>(null);

  // Edit buffer for the data tabs (null = read-only). Edits write to job.parsed via PATCH.
  const [editParsed, setEditParsed] = useState<ParsedUpdate | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Invoice state
  const [invoiceReady, setInvoiceReady] = useState(false);
  const [invoiceLoaded, setInvoiceLoaded] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [laborRows, setLaborRows] = useState<LaborRow[]>([]);
  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([]);
  const [otherRows, setOtherRows] = useState<OtherRow[]>([]);
  const [taxRate, setTaxRate] = useState("0");
  const [invoiceNotes, setInvoiceNotes] = useState("Net 30. Payment due within 30 days of invoice date.");

  // Invoice persistence (Phase 12, Phase 4). invoiceId/invoiceStatus are null until a real
  // JobInvoice doc exists (GET or POST). Edits only autosave while status === "draft" — a sent
  // invoice is immutable server-side (PATCH refuses it), and the effect below mirrors that so
  // the UI never fires a PATCH the server would just reject.
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [invoiceStatus, setInvoiceStatus] = useState<JobInvoice["status"] | null>(null);
  const [invoiceMeta, setInvoiceMeta] = useState<Pick<JobInvoice, "sentAt" | "sentTo" | "paidAt">>({});
  const [markingPaid, setMarkingPaid] = useState(false);
  const [hideMaterials, setHideMaterials] = useState(false);
  const [hideLabor, setHideLabor] = useState(false);
  const [showTechnicians, setShowTechnicians] = useState(false);
  const [technicians, setTechnicians] = useState<string[]>([]);
  const [narrative, setNarrative] = useState("");
  const [invoiceDirty, setInvoiceDirty] = useState(false);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  // Guards the autosave effect from firing the instant hydration (GET/POST) populates the rows —
  // that's a load, not an edit.
  const hydratingInvoiceRef = useRef(false);
  const invoicePatchLock = useRef({ current: false });

  // Report state
  const [report, setReport] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [reportNotes, setReportNotes] = useState("");
  const [reportPhotos, setReportPhotos] = useState<Array<{ label: string; fullB64: string; phase?: PhotoPhase }>>([]);
  const [reportOptions, setReportOptions] = useState<Partial<DocumentOptions>>({});
  const [reportTechnicians, setReportTechnicians] = useState<string[]>([]);
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

  // The live poll below only refetches the heavy parts when this changes (see refreshLive).
  const lastSeenUpdatedAt = useRef(0);
  const photosLoadedRef = useRef(false);
  photosLoadedRef.current = photosLoaded;

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      const [jobRes, updatesRes, configRes, libRes, logosRes] = await Promise.all([
        fetch(`/api/jobs/${jobId}?businessId=${businessId}`).then((r) => r.json()),
        fetch(`/api/jobs/${jobId}/updates?businessId=${businessId}`).then((r) => r.json()),
        fetch(`/api/company/settings?businessId=${businessId}`).then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/company/library?businessId=${businessId}`).then((r) => r.json()).catch(() => null),
        fetch(`/api/company/library/logos?businessId=${businessId}`).then((r) => r.json()).catch(() => null),
      ]);
      const found = (jobRes.job as Job) ?? null;
      lastSeenUpdatedAt.current = found?.updatedAt ?? 0;
      setJob(found);
      setUpdates(updatesRes.updates ?? []);
      if (configRes) setBusinessConfig(configRes as BusinessConfig);
      if (logosRes?.logos) setLogos(logosRes.logos as LibraryLogo[]);
      // Distinguish "fetch failed" (libRes null) from "fetched fine, catalog is
      // just empty" (libRes.library with empty arrays) — only the former means
      // invoice auto-fill silently has nothing to work with and the user
      // should be told, not left to wonder why every price is blank.
      if (libRes?.library) {
        setLibrary(libRes.library as LibraryPricing);
        setLibraryLoadFailed(false);
      } else {
        setLibraryLoadFailed(true);
      }
    } catch {
      // silently fail — show not found below
    }
    setLoading(false);
  }, [businessId, jobId]);

  useEffect(() => { load(); }, [load]);

  // The quote's and the invoice's STATUS are needed on every tab (the numbered tab labels, the "locked" notes), not just when
  // their own tab is open, so read a light summary once when the job loads. The full documents still load in their own tabs.
  const summaryJobId = job?.jobId;
  const summaryInvoiceId = job?.invoiceId;
  useEffect(() => {
    if (!businessId || !summaryJobId) return;
    let live = true;
    fetch(`/api/jobs/${encodeURIComponent(summaryJobId)}/quote?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { quote?: JobQuote | null } | null) => { if (live && d?.quote) setPageQuote((current) => current ?? d.quote ?? null); })
      .catch(() => {});
    if (summaryInvoiceId) {
      fetch(`/api/jobs/${encodeURIComponent(summaryJobId)}/invoice?businessId=${encodeURIComponent(businessId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { invoice?: JobInvoice | null } | null) => {
          const inv = d?.invoice;
          if (!live || !inv) return;
          // Never overwrite what the Invoice tab already loaded or the office just changed (sent / paid).
          setInvoiceStatus((current) => current ?? inv.status);
          setInvoiceMeta((current) => (current.sentAt || current.paidAt ? current : { sentAt: inv.sentAt, sentTo: inv.sentTo, paidAt: inv.paidAt }));
        })
        .catch(() => {});
    }
    return () => { live = false; };
  }, [businessId, summaryJobId, summaryInvoiceId]);

  // Picks up a material price added via the global quick-add (including from
  // this exact page's own "No price on file" prompt) without a full reload.
  useQuickAddRefresh("material", () => {
    if (!businessId) return;
    fetch(`/api/company/library?businessId=${businessId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (d?.library) { setLibrary(d.library as LibraryPricing); setLibraryLoadFailed(false); } })
      .catch(() => {});
  });

  async function updateStatus(newStatus: string) {
    if (!businessId || !job || updatingStatus) return;
    setUpdatingStatus(newStatus);
    setStatusError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, status: newStatus }),
      });
      // Only move the bar when the server actually saved it — a failed PATCH used to leave the screen lying.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatusError(data.error ?? "Could not change the status. Try again.");
        return;
      }
      setJob((j) => j ? { ...j, status: newStatus as Job["status"] } : j);
    } catch {
      setStatusError("Could not change the status. Check the connection and try again.");
    } finally {
      setUpdatingStatus(null);
    }
  }

  // "Retry" on a field update stored as Parse failed: the raw note was kept, so read it again and refresh the job.
  async function retryParse(updateId: string): Promise<string | null> {
    if (!businessId) return "No business selected.";
    const res = await fetch(`/api/jobs/${jobId}/updates/${updateId}/reparse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return data.error ?? "Could not read the note again. Try again.";
    if (data.update) setUpdates((list) => list.map((u) => (u.updateId === updateId ? (data.update as FieldUpdate) : u)));
    if (data.projection) setJob((j) => (j ? { ...j, parsed: data.projection as ParsedUpdate } : j));
    return null;
  }

  // Single source of truth: the job's authoritative projection. Backfill from the
  // ledger for legacy jobs that predate job.parsed. buildProjection merges duplicate
  // materials by name, so the "2×4s 50 / 50 / 150" duplication is gone.
  const projection: ParsedUpdate = job?.parsed ?? buildProjection(updates);
  const view = editParsed ?? projection;
  const timeline = view.timeline;
  const materials = view.materials;
  const labor = view.labor;
  const editing = editParsed !== null;
  // Live view while a technician works: poll ONE document (the job) every 5 s and pull the updates/photos only when
  // the job actually changed. The old version re-ran the full load (5 fetches) each time — fine for a demo, a real
  // read-quota problem on the free plan if a job page is left open. Returned so the hook never overlaps requests, and
  // a failed background poll keeps what is on screen.
  const refreshLive = useCallback(async () => {
    if (!businessId) return;
    const polled = await pollJobOnce({ businessId, jobId, lastSeenUpdatedAt: lastSeenUpdatedAt.current, includePhotos: photosLoadedRef.current });
    if (!polled) return;
    lastSeenUpdatedAt.current = polled.job.updatedAt;
    setJob(polled.job);
    if (polled.updates) setUpdates(polled.updates);
    if (polled.photos) setPhotos(polled.photos);
  }, [businessId, jobId]);
  useLiveRefresh(refreshLive, { intervalMs: 5_000, enabled: Boolean(businessId), isDirty: editing || invoiceDirty });

  // Description of work starts as short, blunt bullets built from the job's findings ("• Tile replacement"), so nobody types it
  // from scratch. Once per invoice, only into an EMPTY draft, and it saves through the normal invoice autosave.
  const narrativePrefilledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!invoiceReady || invoiceStatus !== "draft" || !invoiceId) return;
    if (narrativePrefilledFor.current === invoiceId) return;
    narrativePrefilledFor.current = invoiceId;
    if (narrative.trim()) return;
    const bullets = draftWorkDescription(job?.findings);
    if (bullets) setNarrative(bullets);
  }, [invoiceReady, invoiceStatus, invoiceId, narrative, job?.findings]);

  // Opening the Report tab generates the report (and drafts its notes) straight away when there is something to report,
  // instead of asking for a "Generate Report" click first. Once per visit; Regenerate stays available.
  const autoReportTried = useRef(false);
  useEffect(() => {
    if (activeTab !== "report") { autoReportTried.current = false; return; }
    if (report || autoReportTried.current || !job) return;
    if (updates.length === 0 && !job.findings?.some((f) => f.includeInReport)) return;
    autoReportTried.current = true;
    void generateReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, report, job, updates.length]);
  // Multi-day jobs: show the date alongside each timeline event's time.
  const timelineMultiDay = new Set(timeline.map((t) => (t.dateMs ? fmt.dayKey(t.dateMs) : "")).filter(Boolean)).size > 1;
  const fmtDay = fmt.fmtDay;

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

  // Lazy-load a previously-saved invoice the first time the Invoice tab is opened — this is the
  // actual fix for "leaving the tab discards the work": if job.invoiceId already points at a
  // real doc, hydrate from it instead of starting from a blank "Generate Invoice" screen.
  useEffect(() => {
    if (activeTab !== "invoice" || invoiceLoaded || !businessId || !job) return;
    if (!job.invoiceId) { setInvoiceLoaded(true); return; }
    fetch(`/api/jobs/${jobId}/invoice?businessId=${businessId}`)
      .then((r) => r.json())
      .then((d) => {
        const inv = d.invoice as JobInvoice | null;
        if (!inv) return;
        hydratingInvoiceRef.current = true;
        setLaborRows(laborLinesToRows(inv.labor));
        setMaterialRows(materialLinesToRows(inv.materials));
        setOtherRows(otherLinesToRows(inv.other));
        setTaxRate(String(inv.taxRate));
        setHideMaterials(inv.hideMaterials);
        setHideLabor(inv.hideLabor === true);
        setShowTechnicians(inv.showTechnicians === true);
        setTechnicians(inv.technicians ?? []);
        setNarrative(inv.narrative ?? "");
        setInvoiceNotes(inv.notes ?? invoiceNotes);
        setInvoiceId(inv.invoiceId);
        setInvoiceStatus(inv.status);
        setInvoiceMeta({ sentAt: inv.sentAt, sentTo: inv.sentTo, paidAt: inv.paidAt });
        setInvoiceReady(true);
      })
      .catch(() => {})
      .finally(() => setInvoiceLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, invoiceLoaded, businessId, job, jobId]);

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
  const laborCatalog = library?.laborRates ?? [];

  // Phase 12, Phase 4: "Generate Invoice" now persists a real JobInvoice doc server-side
  // (POST /api/jobs/[jobId]/invoice) instead of building ephemeral rows in local state — the
  // server's buildDraftFromProjection is the ONE place a draft gets built, so the client never
  // duplicates that precedence logic and can't drift from what actually gets saved. POST is
  // idempotent: clicking it again on an already-invoiced job just re-fetches the existing doc.
  async function generateInvoice(force = false) {
    if (!businessId) return;
    setGeneratingInvoice(true);
    setInvoiceError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, force }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInvoiceError(data.error ?? "Failed to generate invoice");
        return;
      }
      const inv = data.invoice as JobInvoice;
      hydratingInvoiceRef.current = true;
      setLaborRows(laborLinesToRows(inv.labor));
      setMaterialRows(materialLinesToRows(inv.materials));
      setOtherRows(otherLinesToRows(inv.other));
      setTaxRate(String(inv.taxRate));
      setHideMaterials(inv.hideMaterials);
      setHideLabor(inv.hideLabor === true);
      setShowTechnicians(inv.showTechnicians === true);
      setTechnicians(inv.technicians ?? []);
      setNarrative(inv.narrative ?? "");
      setInvoiceId(inv.invoiceId);
      setInvoiceStatus(inv.status);
      setInvoiceMeta({ sentAt: inv.sentAt, sentTo: inv.sentTo, paidAt: inv.paidAt });
      setJob((j) => (j && !j.invoiceId ? { ...j, invoiceId: inv.invoiceId } : j));
      setInvoiceLoaded(true);
      setInvoiceReady(true);
      setActiveTab("invoice");
    } catch (e) {
      setInvoiceError(e instanceof Error ? e.message : "Failed to generate invoice");
    } finally {
      setGeneratingInvoice(false);
    }
  }

  async function addFindingsToDraftInvoice() {
    if (!businessId || !invoiceId || invoiceStatus !== "draft" || invoiceDirty || invoiceSaving) return;
    setInvoiceSaving(true); setInvoiceError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/invoice`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, addFindings: true }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add findings to invoice");
      const inv = data.invoice as JobInvoice;
      hydratingInvoiceRef.current = true;
      setLaborRows(laborLinesToRows(inv.labor));
      setMaterialRows(materialLinesToRows(inv.materials));
      setOtherRows(otherLinesToRows(inv.other));
      setInvoiceDirty(false);
    } catch (e) { setInvoiceError(e instanceof Error ? e.message : "Could not add findings to invoice"); }
    finally { setInvoiceSaving(false); }
  }

  async function generateReport() {
    setReport("ready");
    setActiveTab("report");
    // First open with no saved notes: start from a deterministic draft (facts only, no prices, honoring the hide options)
    // so the admin reviews and edits instead of writing from scratch. Saved on the first edit/blur or when mailed.
    const savedOptions = job?.reportOptions ?? {};
    setReportNotes(job?.reportNotes?.trim() ? job.reportNotes : job ? draftReportNotes(job, savedOptions) : "");
    setReportOptions(savedOptions);
    setReportTechnicians(job?.reportTechnicians ?? []);
    // Load full-res blobs for the photos marked include-in-report (≤ 8 → 2 pages).
    let metas = photos;
    if (!photosLoaded) {
      metas = await fetch(`/api/jobs/${jobId}/photos?businessId=${businessId}`).then((r) => r.json()).then((d) => (d.photos ?? []) as JobPhotoMeta[]).catch(() => []);
      setPhotos(metas);
      setPhotosLoaded(true);
    }
    // Sort before → after → other (interleaved is useless), then cap at 2 pages (8/page).
    const included = metas
      .filter((p) => p.includeInReport)
      .sort((a, b) => {
        const order = PHASE_ORDER.indexOf(a.phase ?? "other") - PHASE_ORDER.indexOf(b.phase ?? "other");
        return order !== 0 ? order : (a.sort ?? a.createdAt) - (b.sort ?? b.createdAt);
      })
      .slice(0, MAX_REPORT_PHOTOS);

    // Batched blob fetch (≤12 ids/request) — was one GET per photo.
    const ids = included.map((p) => p.photoId);
    const blobsById: Record<string, string> = {};
    for (let i = 0; i < ids.length; i += 12) {
      const chunk = ids.slice(i, i + 12);
      const r = await fetch(`/api/jobs/${jobId}/photos/blobs?businessId=${businessId}&ids=${chunk.join(",")}`)
        .then((x) => x.json()).catch(() => null);
      if (r?.blobs) Object.assign(blobsById, r.blobs);
    }
    setReportPhotos(
      included
        .filter((p) => blobsById[p.photoId])
        .map((p) => ({ label: p.label, fullB64: blobsById[p.photoId], phase: p.phase ?? "other" }))
    );
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

  async function saveReportNotes(nextOptions = reportOptions, nextTechnicians = reportTechnicians, nextNotes = reportNotes) {
    if (!businessId) return;
    await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, reportNotes: nextNotes, reportOptions: nextOptions, reportTechnicians: nextTechnicians }),
    }).catch(() => {});
    setJob((j) => (j ? { ...j, reportNotes: nextNotes, reportOptions: nextOptions, reportTechnicians: nextTechnicians } : j));
  }

  function draftReportNarrative() {
    const next = job ? draftReportNotes(job, reportOptions) : "";
    if (!next || (reportNotes.trim() && !confirm("Replace the current scope and resolution notes with the job draft?"))) return;
    setReportNotes(next);
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

  // Phase 12, Phase 4: the server now reads the SAVED invoice doc rather than trusting rows the
  // client sends — canSendInvoice gates the button so a send can't race an in-flight autosave.
  async function sendInvoice() {
    if (!canSendInvoice(invoiceId, invoiceDirty, sendEmail)) {
      setSendError(invoiceDirty ? "Still saving your edits — try again in a moment." : "Enter a recipient email.");
      return;
    }
    setSending(true); setSendError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/invoice/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, to: sendEmail.trim() }),
      });
      if (res.ok) {
        setSendSuccess(true);
        const to = sendEmail.trim();
        setSendEmail("");
        setInvoiceStatus((s) => (s === "paid" ? s : "sent"));
        setInvoiceMeta((m) => ({ ...m, sentAt: Date.now(), sentTo: to }));
        // The server moved the job to Invoiced on the send; mirror it so the status bar agrees without a reload.
        setJob((j) => (j ? { ...j, status: "invoiced" } : j));
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

  // "Mark paid": the office records the payment (there is no online payment on job invoices).
  async function markInvoicePaid() {
    if (!businessId || invoiceStatus !== "sent" || markingPaid) return;
    setMarkingPaid(true); setInvoiceError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/invoice`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, status: "paid" }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setInvoiceError(data.error ?? "Could not mark the invoice paid."); return; }
      setInvoiceStatus("paid");
      setInvoiceMeta((m) => ({ ...m, paidAt: (data.invoice as JobInvoice | undefined)?.paidAt ?? Date.now() }));
    } catch {
      setInvoiceError("Could not mark the invoice paid. Check the connection and try again.");
    } finally {
      setMarkingPaid(false);
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
  // The exact same computeTotals the server's PATCH handler runs — client preview and persisted
  // totals can never drift apart. Pure/O(rows); safe on every render, no memo needed.
  const { laborSubtotal, materialSubtotal, otherSubtotal, subtotal, taxAmount: tax, total: grandTotal } = computeTotals({
    labor: laborRowsToLines(laborRows),
    materials: materialRowsToLines(materialRows),
    other: otherRowsToLines(otherRows),
    taxRate: parseFloat(taxRate) || 0,
  });

  // Autosave (debounced 1200ms) — PATCH only while a real draft invoice exists; the server
  // itself refuses a PATCH once status !== "draft", and this mirrors that so an edit after
  // sending doesn't even attempt a doomed request. hydratingInvoiceRef skips the single pass
  // triggered by loading/generating the invoice — that's a load, not an edit.
  useEffect(() => {
    if (hydratingInvoiceRef.current) { hydratingInvoiceRef.current = false; return; }
    if (!invoiceId || invoiceStatus !== "draft" || !businessId) return;
    setInvoiceDirty(true);
    const timer = setTimeout(() => {
      runSingleFlight(invoicePatchLock.current, async () => {
        setInvoiceSaving(true);
        try {
          const res = await fetch(`/api/jobs/${jobId}/invoice`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              businessId,
              labor: laborRowsToLines(laborRows),
              materials: materialRowsToLines(materialRows),
              other: otherRowsToLines(otherRows),
              taxRate: parseFloat(taxRate) || 0,
              hideMaterials,
              hideLabor,
              showTechnicians,
              technicians,
              narrative,
              notes: invoiceNotes,
            }),
          });
          if (res.ok) setInvoiceDirty(false);
        } catch {
          // Left dirty — the beforeunload guard below still warns, and the next successful
          // autosave (or an explicit retry) clears it. Never silently claim a save that failed.
        } finally {
          setInvoiceSaving(false);
        }
      });
    }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laborRows, materialRows, otherRows, taxRate, hideMaterials, hideLabor, showTechnicians, technicians, narrative, invoiceNotes, invoiceId, invoiceStatus, businessId, jobId]);

  // Warn on tab close/navigate-away with unsaved invoice edits still in flight.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => guardUnsavedInvoiceUnload(e, invoiceDirty);
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [invoiceDirty]);

  // Order follows the work: what happened (Timeline, Photos, Issues), what we found and quote (Findings, Quote), the detail
  // behind the numbers (Materials, Labor), then the customer documents (Report, Invoice).
  const TABS = [
    { id: "timeline", label: `Activity (${updates.length})` },
    { id: "photos", label: photosLoaded ? `Photos (${photos.length})` : "Photos" },
    { id: "materials", label: `Materials (${materials.length})` },
    { id: "labor", label: `Labor (${labor.length})` },
  ] as const;
  const steps = job ? jobSteps(job) : [];
  const WORKFLOW_TABS = [
    { id: "findings", number: "①", label: "Findings", step: steps.find((step) => step.id === "findings") },
    { id: "quote", number: "②", label: "Quote", step: steps.find((step) => step.id === "quote") },
    { id: "report", number: "③", label: "Report", step: steps.find((step) => step.id === "report") },
    { id: "invoice", number: "④", label: "Invoice", step: steps.find((step) => step.id === "invoice") },
  ] as const;

  if (loading) return <PageSkeleton rows={6} />;
  if (!job) return (
    <div style={{ padding: 32 }}>
      <p style={{ color: "#b91c1c", fontSize: 14, margin: "0 0 12px" }}>Job not found.</p>
      <a href={`/company/jobs${previewSuffix}`} className="button secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <ArrowLeft size={14} strokeWidth={1.75} />
        Back to Jobs
      </a>
    </div>
  );

  const editBar = (
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
  );

  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const due = new Date(Date.now() + 30 * 86400000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  // Invoice letterhead branding — mirrors ReportRenderer's own accent/bizName so the invoice and
  // job report read as the same document family. The logo library's default (Phase 12, Phase 4
  // remainder) takes precedence over the older single businessConfig.logoUrl field — most
  // tenants will only ever have the one from Settings, so this is a strict upgrade, never a
  // regression: no library logo just means the same fallback as before it existed.
  const invoiceAccent = businessConfig?.brandColor ?? "#1e3a5f";
  const invoiceBizName = businessConfig?.businessName ?? job.title;
  const defaultLogo = pickDefaultLogo(logos);
  const invoiceLogoSrc = defaultLogo ? logoDataUri(defaultLogo) : businessConfig?.logoUrl;
  const invoiceLetterhead = resolveLetterhead(businessConfig ?? {}, logos);
  const customerInvoice = { labor: laborRowsToLines(laborRows), materials: materialRowsToLines(materialRows), other: otherRowsToLines(otherRows), taxRate: parseFloat(taxRate) || 0, hideMaterials, hideLabor } as JobInvoice;

  return (
    <>
      <style>{`
        /* Twin-render base rule: .print-only content (e.g. the collapsed "Materials & supplies"
           line when hiding the breakdown from the customer) stays hidden on screen and only
           appears once @media print flips it back to block below. Without this base rule the
           .print-only element has no display rule of its own outside of print and just renders
           at its default display — i.e. always visible, duplicating the on-screen content. */
        .print-only { display: none; }

        /* A sent/paid invoice: no add/remove/picker controls, no "editable" dashed underlines. */
        .invoice-locked button, .invoice-locked select { display: none !important; }
        .invoice-locked input, .invoice-locked textarea { border-bottom-color: transparent !important; background: transparent; color: inherit; }

        /* Report photo grid (Phase 12, Phase 3) — a fixed-aspect card slot + object-fit: contain
           + a blurred scaled copy of the same image as the backdrop. No crop (the old bug: a
           fixed-height box with object-fit: cover), no distortion, no dead letterbox space. */
        .rpt-photos { display: grid; grid-template-columns: repeat(2, 1fr);
                      gap: .14in .2in; break-before: page; page-break-before: always; }
        .rpt-photo  { break-inside: avoid; page-break-inside: avoid;
                      border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #fff; }
        .rpt-photo--spacer { visibility: hidden; }

        .rpt-photo__frame { position: relative; aspect-ratio: 16 / 10; background: #eef2f6; overflow: hidden; }
        .rpt-photo__bg    { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
                            filter: blur(14px) saturate(1.1) brightness(.92); transform: scale(1.12); }
        .rpt-photo__img   { position: absolute; inset: 0; width: 100%; height: 100%;
                            object-fit: contain; object-position: center; }

        .rpt-photo__cap   { display: flex; align-items: baseline; gap: 6px;
                            padding: 5px 8px 7px; font-size: 8.5pt; line-height: 1.25; color: #475569; }
        .rpt-photo__phase { flex: none; font-size: 7pt; font-weight: 800; letter-spacing: .06em;
                            text-transform: uppercase; padding: 1px 5px; border-radius: 4px; color: #fff; }
        .rpt-photo__phase--before { background: #64748b; }
        .rpt-photo__phase--after  { background: var(--report-accent, #0f172a); }
        .rpt-photo__label { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; }

        @media print {
          /* Print ONLY the document — strip all app chrome so a PDF reads like a real invoice */
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .company-topbar, .company-nav, .company-sidebar, .admin-sidebar { display: none !important; }
          .company-shell, .admin-shell { grid-template-columns: 1fr !important; }
          .company-main, .admin-main { padding: 0 !important; background: #fff !important; }
          body { background: #fff !important; }
          .panel { box-shadow: none; border: none; }
          .quote-panel-body > :not(.quote-preview-wrap) { display: none !important; }
          .invoice-doc, .quote-doc, .report-doc {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            max-width: 100% !important;
            margin: 0 auto !important;
          }
          .rpt-photo__bg { display: none; }
          .rpt-photo { border-color: #cbd5e1; }
          .rpt-photos { gap: .12in .18in; }
          .rpt-photo__cap, .rpt-photo__phase { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: letter portrait; margin: 0.4in; }
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
          {job.sourceCallId && <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 0" }}>From call · {fmt.fmtDayTime(job.createdAt)} · <a href={`/company/calls${previewSuffix}`} style={{ color: "var(--accent)" }}>View transcript</a></p>}
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
          {/* ONE primary action, always the next unfinished step. Report and Invoice are the numbered tabs below. */}
          <NextStepButton job={job} busy={updatingStatus === "complete"} onGo={(tab) => setActiveTab(tab)} onCompleteWork={() => void updateStatus("complete")} />
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

      {statusError && (
        <p role="alert" className="no-print" style={{ margin: "-8px 0 12px", color: "#b91c1c", fontSize: 13 }}>{statusError}</p>
      )}

      {/* Tab bar */}
      <div className="job-tabs no-print">
        {TABS.map((tab) => (
          <button className={`job-tab ${activeTab === tab.id ? "active" : ""}`} key={tab.id} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
        <span className="job-tabs-divider" aria-hidden="true" />
        {WORKFLOW_TABS.map((tab) => {
          const quoteLabel = tab.id === "quote" && pageQuote && pageQuote.status !== "draft"
            ? { sent: "Sent", accepted: "Accepted", declined: "Declined", expired: "Expired" }[pageQuote.status] ?? null
            : null;
          return <button className={`job-tab job-tab-workflow ${activeTab === tab.id ? "active" : ""} ${tab.step?.state === "current" ? "current" : ""}`} key={tab.id} onClick={() => setActiveTab(tab.id)}>
            <span>{tab.number} {tab.label}</span>{tab.step?.state === "done" && <span aria-label="Complete"> ✓</span>}{quoteLabel && <small>{quoteLabel}</small>}
          </button>;
        })}
      </div>

      {/* Edit / Save / Cancel — Materials and Labor (on Activity it sits right above the work log instead) */}
      {["materials", "labor"].includes(activeTab) && editBar}

      {/* ── Activity: field updates, then the work log, then the job history — all newest first ── */}
      {activeTab === "timeline" && <LockNote quote={pageQuote} invoice={{ invoiceId: job.invoiceId, status: invoiceStatus, ...invoiceMeta }} />}
      {activeTab === "timeline" && (
        <section className="panel no-print" style={{ marginBottom: 16 }}>
          <div className="panel-header">
            <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <ClipboardList size={16} strokeWidth={1.75} />
              Field updates ({updates.length})
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
                {/* The API is chronological; the newest note goes on top, and keeps its own number ("Update 3"). */}
                {[...updates].reverse().map((u, i) => (
                  <ParsedUpdateCard key={u.updateId} update={u} index={updates.length - 1 - i} onRetry={retryParse} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === "timeline" && editBar}
      {activeTab === "timeline" && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header"><h2 className="panel-title">Work log</h2></div>
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
                {/* Newest first; the number stays the event's place in the day's order, so the top one reads "5 of 5". Editing keeps
                    the stored (chronological) order, because its handlers address entries by index. */}
                {[...timeline].reverse().map((t, i) => (
                  <li key={timeline.length - 1 - i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span style={{ minWidth: 24, height: 24, borderRadius: "50%", background: "#e0e7ff", color: "#3730a3", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{timeline.length - i}</span>
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

      {activeTab === "timeline" && <JobHistory businessId={businessId!} jobId={jobId} version={job.updatedAt} />}

      {/* ── Materials ── */}
      {activeTab === "materials" && <LockNote quote={pageQuote} invoice={{ invoiceId: job.invoiceId, status: invoiceStatus, ...invoiceMeta }} />}
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
      {activeTab === "labor" && <LockNote quote={pageQuote} invoice={{ invoiceId: job.invoiceId, status: invoiceStatus, ...invoiceMeta }} />}
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

      {/* The crew's reported issues now live in Findings ("Reported by crew"), where each one becomes a finding. */}

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
                        {ph.phase && ph.phase !== "other" && (
                          <span style={{
                            display: "inline-block", marginBottom: 6, fontSize: 9, fontWeight: 800,
                            letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 6px", borderRadius: 4,
                            color: "#fff", background: ph.phase === "before" ? "#64748b" : "var(--accent)",
                          }}>{ph.phase}</span>
                        )}
                        <p style={{ margin: "0 0 6px", fontSize: 12, color: "#334155", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{ph.label}</p>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#475569" }}>
                            <Toggle checked={!!ph.includeInReport} onChange={() => toggleInclude(ph)} label={`Include ${ph.label} in report`} size="sm" />
                            In report
                          </div>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button onClick={() => setEditingPhoto(ph)} title="Edit" aria-label={`Edit ${ph.label}`} className="icon-del">
                              <Pencil size={14} strokeWidth={1.75} />
                            </button>
                            <button onClick={() => { if (confirm("Delete this photo?")) deletePhoto(ph); }} title="Delete" aria-label={`Delete ${ph.label}`} className="icon-del">
                              <Trash2 size={15} strokeWidth={1.75} />
                            </button>
                          </div>
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

      <PhotoEditSheet
        photo={editingPhoto}
        jobId={jobId}
        businessId={businessId}
        beforePhotos={photos.filter((photo) => photo.phase === "before")}
        canCurate
        onClose={() => setEditingPhoto(null)}
        onSaved={(patch) => setPhotos((ps) => ps.map((p) => {
          if (p.photoId !== editingPhoto?.photoId) return p;
          const { pairId, ...rest } = patch;
          return { ...p, ...rest, ...(pairId !== undefined ? { pairId: pairId ?? undefined } : {}) };
        }))}
        onDeleted={() => setPhotos((ps) => ps.filter((p) => p.photoId !== editingPhoto?.photoId))}
      />

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
                Expires {fmt.fmtTime(qrExpiresAt)} — one scan only
              </p>
            )}
            {qrFieldUrl && !qrLoading && (
              // A short opaque path now (see /f/[grant]), not the raw signed
              // token — safe to show. A visible, selectable field also
              // doubles as the copy fallback, so there's no prompt() dialog
              // exposing anything if the Clipboard API is unavailable.
              <input
                type="text"
                readOnly
                value={qrFieldUrl}
                onFocus={(e) => e.currentTarget.select()}
                onClick={(e) => e.currentTarget.select()}
                aria-label="Field link"
                style={{ width: "100%", marginTop: 14, fontSize: 12, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, color: "#334155", fontFamily: "monospace", textAlign: "center", background: "#f8fafc" }}
              />
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "center" }}>
              {qrFieldUrl && !qrLoading && (
                <button className="button" style={{ fontSize: 12 }} onClick={() => {
                  navigator.clipboard.writeText(qrFieldUrl).then(() => { setQrLinkCopied(true); setTimeout(() => setQrLinkCopied(false), 2500); }).catch(() => {});
                }}>
                  {qrLinkCopied ? "Link copied" : "Copy link"}
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

      {activeTab === "findings" && <LockNote quote={pageQuote} invoice={{ invoiceId: job.invoiceId, status: invoiceStatus, ...invoiceMeta }} />}
      {activeTab === "findings" && <FindingsPanel job={job} businessId={businessId!} catalog={catalog} onSaved={(findings) => setJob((current) => current ? { ...current, findings } : current)} />}

      {activeTab === "quote" && <QuotePanel job={job} businessId={businessId!} businessConfig={businessConfig} logos={logos} catalog={catalog}
        onStatus={(status) => setJob((current) => current ? { ...current, status } : current)}
        onFindingsChanged={(findings) => setJob((current) => current ? { ...current, findings } : current)} onQuoteChange={setPageQuote} />}

      {/* ── Invoice ── */}
      {activeTab === "invoice" && (
        <div>
          <p className="no-print" style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 12px" }}>
            Email the invoice to your customer or print it. There is no online payment yet, so press Mark paid once they pay.
          </p>
          {invoiceError && (
            <div role="alert" className="no-print" style={{ padding: "10px 16px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, marginBottom: 12, color: "#b91c1c", fontSize: 13 }}>
              {invoiceError}
            </div>
          )}
          {!invoiceReady ? (
            <section className="panel">
              <div className="panel-body" style={{ textAlign: "center", padding: "40px 20px" }}>
                <p style={{ color: "#888", fontSize: 14, marginBottom: 16 }}>
                  {updates.length === 0 && !job.findings?.length
                    ? "Add a field update or finding first."
                    : "No invoice yet. Create a draft from this job's field notes and findings; you review it before anything is sent."}
                </p>
                {(updates.length > 0 || !!job.findings?.length) && (
                  <button className="button primary" onClick={() => generateInvoice()} disabled={generatingInvoice} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Receipt size={15} strokeWidth={1.75} />
                    {generatingInvoice ? "Creating…" : "Create invoice"}
                  </button>
                )}
              </div>
            </section>
          ) : (
            <div style={{ maxWidth: 780, margin: "0 auto" }}>
              {/* Invoice toolbar */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }} className="no-print">
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#64748b" }}>
                  {invoiceStatus && (
                    <span style={{
                      fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10,
                      padding: "2px 8px", borderRadius: 10,
                      background: invoiceStatus === "paid" ? "#dcfce7" : invoiceStatus === "draft" ? "#eff6ff" : "#f0fdf4",
                      color: invoiceStatus === "draft" ? "#3b82f6" : "#15803d",
                    }}>{invoiceStatus === "paid" ? "✓ Paid" : invoiceStatus}</span>
                  )}
                  {invoiceStatus === "draft" && (invoiceSaving ? "Saving…" : invoiceDirty ? "Unsaved changes" : "Saved")}
                  <details>
                    <summary style={{ cursor: "pointer", fontWeight: 600 }}>{OPTIONS_HEADING}</summary>
                    <div style={{ marginTop: 8, maxWidth: 380 }}>
                      <DocumentOptionToggles disabled={invoiceStatus !== "draft"} values={{ hideMaterials, hideLabor, showTechnicians }}
                        onChange={(key, next) => (key === "hideMaterials" ? setHideMaterials(next) : key === "hideLabor" ? setHideLabor(next) : setShowTechnicians(next))} />
                    </div>
                  </details>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {invoiceStatus === "draft" && <button className="button" onClick={addFindingsToDraftInvoice} disabled={invoiceSaving || invoiceDirty || !job.findings?.some((f) => f.lines?.length)} style={{ fontSize: 13 }}>Add ticked findings to invoice</button>}
                  <button className="button" onClick={() => { setShowSendPanel(p => !p); setSendSuccess(false); setSendError(null); }} style={{ fontSize: 13, background: showSendPanel ? "#eff6ff" : undefined, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Send size={14} strokeWidth={1.75} />
                    {invoiceStatus === "draft" ? "Send to Customer" : "Send again"}
                  </button>
                  {invoiceStatus === "sent" && (
                    <button className="button primary" onClick={() => void markInvoicePaid()} disabled={markingPaid} style={{ fontSize: 13 }}>
                      {markingPaid ? "Saving…" : "Mark paid"}
                    </button>
                  )}
                  <button className="button" onClick={() => window.print()} style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Printer size={14} strokeWidth={1.75} />
                    Print / Save as PDF
                  </button>
                  {invoiceStatus === "draft" && (
                    <button className="button" onClick={() => generateInvoice(true)} disabled={generatingInvoice} title="Rebuild labor/materials from the latest field updates" style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <RefreshCw size={14} strokeWidth={1.75} />
                      {generatingInvoice ? "Regenerating…" : "Regenerate"}
                    </button>
                  )}
                </div>
              </div>

              {invoiceStatus && invoiceStatus !== "draft" && (
                <div className="no-print" style={{ marginBottom: 16, padding: "10px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 13, color: "#15803d" }}>
                  🔒 {invoiceStatus === "paid"
                    ? `Paid${invoiceMeta.paidAt ? ` on ${fmt.fmtDayTime(invoiceMeta.paidAt)}` : ""}.`
                    : `Sent${invoiceMeta.sentTo ? ` to ${invoiceMeta.sentTo}` : ""}${invoiceMeta.sentAt ? ` on ${fmt.fmtDayTime(invoiceMeta.sentAt)}` : ""}.`}
                  {" "}This invoice is locked: new field updates or edits on the job won&apos;t change it.
                </div>
              )}

              {/* Library couldn't be reached — every material price below is blank, not because
                  nothing matched, but because the catalog itself never loaded. Silent otherwise. */}
              {libraryLoadFailed && (
                <div
                  role="alert"
                  className="no-print"
                  style={{ marginBottom: 16, padding: "12px 16px", background: "#fffbeb", border: "1px dashed #fcd34d", borderRadius: 8, display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}
                >
                  <AlertCircle size={16} strokeWidth={1.75} style={{ color: "var(--warning)", flexShrink: 0 }} />
                  <span style={{ color: "var(--text)" }}>
                    Your pricing catalog couldn&apos;t be loaded, so material prices weren&apos;t auto-filled —
                    check them below before sending.
                  </span>
                  <button type="button" className="button small" onClick={load} style={{ marginLeft: "auto", flexShrink: 0 }}>
                    Retry
                  </button>
                </div>
              )}

              {/* Send invoice panel */}
              {showSendPanel && (
                <div style={{ marginBottom: 16, padding: "16px 20px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10 }} className="no-print">
                  <p style={{ margin: "0 0 10px", fontWeight: 600, fontSize: 14, color: "#0369a1" }}>Email this invoice</p>
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
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b" }}>Sending locks the invoice and marks the job Invoiced. The customer can reply to your email to discuss it.</p>
                </div>
              )}

              {/* Invoice document — a sent/paid invoice is immutable server-side, so the whole editor is a disabled
                  fieldset: typing into a locked invoice used to look like it worked and was silently never saved. */}
              <fieldset disabled={invoiceStatus !== "draft"} className={`invoice-editor no-print${invoiceStatus !== "draft" ? " invoice-locked" : ""}`} style={{
                background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, margin: 0, minWidth: 0,
                padding: "44px 52px", fontFamily: "system-ui, sans-serif", color: "#1e293b",
                boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
              }}>
                {/* Letterhead */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, marginBottom: 24, paddingBottom: 24, borderBottom: `3px solid ${invoiceAccent}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    {invoiceLogoSrc && (
                      <img src={invoiceLogoSrc} alt={invoiceBizName} style={{ height: 52, maxWidth: 140, objectFit: "contain" }} />
                    )}
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 19, color: "#0f172a" }}>{invoiceBizName}</div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 3, lineHeight: 1.6 }}>
                        {businessConfig?.address && <>{businessConfig.address}<br /></>}
                        {(businessConfig?.contactPhone || businessConfig?.contactEmail) && (
                          <>{[businessConfig?.contactPhone, businessConfig?.contactEmail].filter(Boolean).join("  ·  ")}<br /></>
                        )}
                        {businessConfig?.websiteUrl && <>{businessConfig.websiteUrl}</>}
                        {businessConfig?.licenseNumber && <><br />License #{businessConfig.licenseNumber}</>}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 28, color: invoiceAccent, letterSpacing: "-0.02em", marginBottom: 8 }}>Invoice</div>
                    {invoiceStatus && invoiceStatus !== "draft" && (
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#15803d", marginBottom: 6 }}>{invoiceStatus}</div>
                    )}
                    <table style={{ fontSize: 12, borderCollapse: "collapse", marginLeft: "auto" }}>
                      <tbody>
                        <InvoiceMetaRow label="Date" value={today} accent={invoiceAccent} />
                        <InvoiceMetaRow label="Invoice No." value={invoiceId ?? jobId} accent={invoiceAccent} />
                        <InvoiceMetaRow label="Due" value={due} accent={invoiceAccent} />
                        {job.serviceType && <InvoiceMetaRow label="Service" value={job.serviceType} accent={invoiceAccent} />}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Bill To + Service Info */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32, padding: "16px 0", borderBottom: "1px solid #e2e8f0" }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: invoiceAccent, marginBottom: 6 }}>Bill To</div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{job.clientName || "—"}</div>
                    {job.clientPhone && <div style={{ fontSize: 13, color: "#64748b" }}>{job.clientPhone}</div>}
                    {job.address && <div style={{ fontSize: 13, color: "#64748b" }}>{job.address}</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: invoiceAccent, marginBottom: 6 }}>Service At</div>
                    <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.7 }}>
                      <div><strong style={{ color: "#1e293b" }}>Job:</strong> {job.title}</div>
                      <div><strong style={{ color: "#1e293b" }}>Job ID:</strong> {jobId}</div>
                      {job.address && <div><strong style={{ color: "#1e293b" }}>Site:</strong> {job.address}</div>}
                    </div>
                  </div>
                </div>

                <div className="no-print" style={{ marginBottom: 20 }}>
                  <label htmlFor="invoiceNarrative" style={{ fontWeight: 600, fontSize: 13 }}>Description of work <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>— short bullet points, shown to the customer</span></label>
                  <textarea id="invoiceNarrative" maxLength={4000} rows={Math.min(8, Math.max(3, narrative.split("\n").length + 1))} placeholder="• What was done, one line each" disabled={invoiceStatus !== "draft"} value={narrative} onChange={(event) => setNarrative(event.target.value)} style={{ width: "100%", display: "block", marginTop: 6 }} />
                  {showTechnicians && <label>Technicians (comma separated, up to 10)<input list="invoice-technicians" value={technicians.join(", ")} disabled={invoiceStatus !== "draft"} onChange={(event) => setTechnicians(event.target.value.split(",").slice(0, 10).map((name) => name.trim()))} style={{ width: "100%", display: "block" }} /><datalist id="invoice-technicians">{job.parsed?.labor.map((entry, index) => <option key={index} value={entry.description} />)}</datalist></label>}
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
                          <th style={thStyle("right")}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                              Rate/hr
                              <span className="no-print">
                                <Tooltip
                                  content={
                                    laborCatalog.length > 0
                                      ? "Pick a role to fill its saved Library rate, or type your own."
                                      : `No roles saved yet — using your business default ($${defaultLaborRate}/hr). Add roles & rates in Library → Pricing to auto-fill rates here.`
                                  }
                                >
                                  <button type="button" aria-label="Where this rate comes from" style={{ background: "none", border: "none", padding: 0, cursor: "help", display: "inline-flex" }}>
                                    <AlertCircle size={12} strokeWidth={1.75} style={{ color: "#94a3b8" }} />
                                  </button>
                                </Tooltip>
                              </span>
                            </span>
                          </th>
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
                            <td style={tdStyle("right")}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                                {laborCatalog.length > 0 && (
                                  <select
                                    className="no-print"
                                    value=""
                                    aria-label={`Pick a saved rate for ${row.name || "this row"}`}
                                    onChange={(e) => {
                                      const picked = laborCatalog.find((l) => l.role === e.target.value);
                                      if (picked) setLaborRows(r => r.map((x, j) => j === i ? { ...x, rate: String(picked.rate) } : x));
                                    }}
                                    style={{ fontSize: 11, border: "1px solid #e2e8f0", borderRadius: 4, padding: "2px 2px", color: "#64748b", background: "#fff" }}
                                  >
                                    <option value="">Role…</option>
                                    {laborCatalog.map((l) => (
                                      <option key={l.role} value={l.role}>{l.role} (${l.rate})</option>
                                    ))}
                                  </select>
                                )}
                                $<InlineInput value={row.rate} onChange={(v) => setLaborRows(r => r.map((x, j) => j === i ? { ...x, rate: v } : x))} placeholder={defaultLaborRate} align="right" width={48} />
                              </div>
                            </td>
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
                  {/* Full itemized breakdown — always shown on screen; hidden from the printed/PDF
                      output (not from the app itself) when "Hide materials from customer" is on. */}
                  <div className={hideMaterials ? "no-print" : undefined}>
                  {materialRows.length === 0 ? (
                    <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 6px" }}>No materials extracted. Add manually below.</p>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 6 }}>
                      <thead>
                        <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                          <th style={thStyle("left")}>Item</th>
                          <th style={thStyle("right")}>Qty</th>
                          <th style={thStyle("left")}>Unit</th>
                          <th style={thStyle("right")}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                              Unit Price
                              <span className="no-print">
                                <Tooltip content="Auto-filled from your Library pricing catalog when a field note doesn't include a cost. No match yet? The price is left blank rather than guessed, so it never inflates or shrinks your total silently.">
                                  <button type="button" aria-label="How unit price is filled" style={{ background: "none", border: "none", padding: 0, cursor: "help", display: "inline-flex" }}>
                                    <AlertCircle size={12} strokeWidth={1.75} style={{ color: "#94a3b8" }} />
                                  </button>
                                </Tooltip>
                              </span>
                            </span>
                          </th>
                          <th style={thStyle("right")}>Total</th>
                          <th style={thStyle("right")} className="no-print"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {materialRows.map((row, i) => {
                          const unpriced = row.item.trim() !== "" && row.unitPrice.trim() === "";
                          return (
                          <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={tdStyle()}><InlineInput value={row.item} onChange={(v) => setMaterialRows(r => r.map((x, j) => j === i ? { ...x, item: v } : x))} placeholder="Item" /></td>
                            <td style={tdStyle("right")}><InlineInput value={row.quantity} onChange={(v) => setMaterialRows(r => r.map((x, j) => j === i ? { ...x, quantity: v } : x))} placeholder="0" align="right" width={56} /></td>
                            <td style={tdStyle()}><InlineInput value={row.unit} onChange={(v) => setMaterialRows(r => r.map((x, j) => j === i ? { ...x, unit: v } : x))} placeholder="sq/pieces/lbs" /></td>
                            <td style={tdStyle("right")}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                                {unpriced && (
                                  <Tooltip
                                    content={`No price on file for "${row.item}" — it isn't in your Library pricing catalog, and this field note didn't include a cost. Click to add it to your catalog, or type a price here.`}
                                  >
                                    <button
                                      type="button"
                                      className="no-print"
                                      aria-label={`No price on file for ${row.item} — add it to your pricing catalog`}
                                      onClick={() => openQuickAdd("material", row.item)}
                                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", color: "var(--warning)" }}
                                    >
                                      <AlertCircle size={13} strokeWidth={1.75} />
                                    </button>
                                  </Tooltip>
                                )}
                                $<InlineInput value={row.unitPrice} onChange={(v) => setMaterialRows(r => r.map((x, j) => j === i ? { ...x, unitPrice: v } : x))} placeholder="0.00" align="right" width={64} />
                              </div>
                            </td>
                            <td style={{ ...tdStyle("right"), fontWeight: 600 }}>${materialTotal(row).toFixed(2)}</td>
                            <td style={tdStyle("right")} className="no-print"><button onClick={() => setMaterialRows(r => r.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16, padding: "0 4px" }} title="Remove">×</button></td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  <button className="no-print" onClick={() => setMaterialRows(r => [...r, { item: "", quantity: "1", unit: "", unitPrice: "" }])} style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Plus size={13} strokeWidth={1.75} />
                    Add material
                  </button>
                  {materialRows.length > 0 && <div style={{ textAlign: "right", fontSize: 13, color: "#64748b", marginTop: 4 }}>Materials subtotal: <strong>${materialSubtotal.toFixed(2)}</strong></div>}
                  </div>
                  {/* Collapsed single line — printed/PDF output only, when hiding the breakdown from the customer */}
                  {hideMaterials && materialRows.length > 0 && (
                    <table className="print-only" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <tbody>
                        <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={tdStyle()}>Materials &amp; supplies</td>
                          <td style={{ ...tdStyle("right"), fontWeight: 600 }}>${materialSubtotal.toFixed(2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Other charges */}
                {otherRows.length > 0 && (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#475569", marginBottom: 8 }}>Other Charges</div>
                    {otherRows.map((row, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <InlineInput value={row.description} onChange={(v) => setOtherRows(r => r.map((x, j) => j === i ? { ...x, description: v } : x))} placeholder="Description" />
                        </div>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 2, flex: "0 0 auto" }}>
                          $<InlineInput value={row.amount} onChange={(v) => setOtherRows(r => r.map((x, j) => j === i ? { ...x, amount: v } : x))} placeholder="0.00" align="right" width={80} />
                        </span>
                        <button className="no-print" type="button" onClick={() => setOtherRows(r => r.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16, padding: "0 4px" }} title="Remove" aria-label="Remove charge">×</button>
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
                    <div style={{ minWidth: 260 }}>
                      <table style={{ width: "100%", fontSize: 13 }}>
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
                        </tbody>
                      </table>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: `1.5px solid ${invoiceAccent}`, borderRadius: 6, padding: "10px 14px", marginTop: 10 }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>Total Due</span>
                        <span style={{ fontWeight: 800, fontSize: 18, color: invoiceAccent }}>${grandTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notes / payment terms */}
                <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: invoiceAccent, marginBottom: 6 }}>Notes & Payment Terms</div>
                  <textarea
                    value={invoiceNotes}
                    onChange={(e) => setInvoiceNotes(e.target.value)}
                    rows={3}
                    style={{ width: "100%", fontSize: 13, color: "#475569", border: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.6, background: "transparent" }}
                  />
                </div>

                <div style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid #e2e8f0", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    {[invoiceBizName, businessConfig?.websiteUrl, businessConfig?.contactPhone].filter(Boolean).join("  ·  ")}
                  </div>
                  {invoiceStatus === "draft" && (
                    <div className="no-print" style={{ marginTop: 4, fontSize: 11, color: "#94a3b8" }}>
                      This is a draft invoice. Please review all amounts before sending to client.
                    </div>
                  )}
                </div>
              </fieldset>
              <div style={{ marginTop: 24 }}>
                <h3 className="no-print">Customer preview</h3>
                <DocumentPreview className="invoice-doc" title="Invoice" brand={invoiceLetterhead}
                  meta={[["Date", today], ["Number", invoiceId ?? jobId], ["Terms", invoiceNotes], ["Reference", jobId], ["Service at", job.address ?? ""], ...(showTechnicians && technicians.length ? [["Technicians", technicians.join(", ")] as [string, string]] : [])]}
                  billTo={{ name: job.clientName ?? "", address: job.address, phone: job.clientPhone }} narrative={narrative}
                  groups={invoiceGroups(customerInvoice)} totalLabel="Total Due" total={grandTotal} />
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
                  {updates.length === 0 && !job.findings?.some((f) => f.includeInReport)
                    ? "No field updates or report findings yet."
                    : "Click Generate Report to produce a job summary."}
                </p>
                {(updates.length > 0 || !!job.findings?.some((f) => f.includeInReport)) && (
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

              <details className="no-print" style={{ marginBottom: 16 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>{OPTIONS_HEADING}</summary>
                <div style={{ marginTop: 8, maxWidth: 380 }}>
                  <DocumentOptionToggles values={reportOptions}
                    onChange={(key, next) => { const options = { ...reportOptions, [key]: next }; setReportOptions(options); void saveReportNotes(options); }} />
                </div>
              </details>

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
                <textarea value={reportNotes} onChange={(e) => setReportNotes(e.target.value)} onBlur={() => { void saveReportNotes(); }} rows={3} placeholder="Summarize the issue identified and the repair applied — this appears in the report." style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 14, lineHeight: 1.6, resize: "vertical", outline: "none", fontFamily: "inherit" }} />
                <button type="button" className="button" onClick={draftReportNarrative} style={{ marginTop: 8, fontSize: 13 }}>Draft from job</button>
                {reportOptions.showTechnicians && <label style={{ display: "block", marginTop: 12, fontSize: 13 }}>Technicians (comma separated, up to 10)<input value={reportTechnicians.join(", ")} onChange={(event) => setReportTechnicians(event.target.value.split(",").slice(0, 10).map((name) => name.trim()).filter(Boolean))} onBlur={() => { void saveReportNotes(); }} list="report-technicians" style={{ display: "block", width: "100%" }} /><datalist id="report-technicians">{job.parsed?.labor.map((entry, index) => <option key={index} value={entry.description} />)}</datalist></label>}
              </div>

              <ReportDocument job={job} jobId={jobId} businessConfig={businessConfig} logos={logos} reportNotes={reportNotes} reportOptions={reportOptions} reportTechnicians={reportTechnicians} reportPhotos={reportPhotos} />
            </div>
          )}
        </div>
      )}

    </>
  );
}

// ── Job status steps ─────────────────────────────────────────────────────────
// Work is finished (Complete) before it is billed (Invoiced) — the same order the jobs list ("Ready to invoice") and
// the crew's "Work complete" button assume. A job becomes Invoiced when its invoice is SENT, not when a draft exists.
const JOB_STEPS = [
  { key: "inspection", label: "Inspection" },
  { key: "quoted",     label: "Quoted" },
  { key: "in_progress", label: "Working" },
  { key: "complete",   label: "Complete" },
  { key: "invoiced",   label: "Invoiced" },
] as const;

function statusToStepIdx(status: string): number {
  const map: Record<string, number> = {
    open: 0, inspection: 0, quoted: 1, in_progress: 2, complete: 3, invoiced: 4,
  };
  return map[status] ?? 0;
}

// ── Parsed field update card ──────────────────────────────────────────────────
function ParsedUpdateCard({ update, index, onRetry }: { update: FieldUpdate; index: number; onRetry?: (updateId: string) => Promise<string | null> }) {
  const { fmtDayTime } = useFormat();
  const [showRaw, setShowRaw] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  async function retry() {
    if (!onRetry || retrying) return;
    setRetrying(true);
    setRetryError(await onRetry(update.updateId));
    setRetrying(false);
  }
  // Spanish (Phase 12, Phase 6) — "View original" defaults to the English rendering when the
  // source wasn't English; this second toggle flips to the verbatim spoken text. Pure client
  // state, zero fetch: rawText/rawTextEn both already arrive in the updates payload.
  const [showVerbatim, setShowVerbatim] = useState(false);

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
          {fmtDayTime(update.createdAt)}
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
          {update.parseError && onRetry && (
            <button type="button" className="button small" onClick={() => void retry()} disabled={retrying} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <RefreshCw size={12} strokeWidth={1.75} />
              {retrying ? "Reading again…" : "Retry"}
            </button>
          )}
        </div>
        <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>
          {fmtDayTime(update.createdAt)}
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
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#b91c1c" }}>
          The AI could not read this note, so nothing from it reached the job yet. The note is saved; press Retry.
        </p>
      )}
      {retryError && <p role="alert" style={{ margin: "4px 0 0", fontSize: 13, color: "#b91c1c" }}>{retryError}</p>}

      {/* View original disclosure */}
      <button
        onClick={() => setShowRaw((r) => !r)}
        style={{ marginTop: 10, fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
      >
        {showRaw ? "Hide original" : "View original"}
      </button>
      {showRaw && (
        <>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#475569", lineHeight: 1.5, wordBreak: "break-word", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 10px" }}>
            {update.rawTextEn && !showVerbatim ? update.rawTextEn : update.rawText}
          </p>
          {update.rawTextEn && (
            <button
              onClick={() => setShowVerbatim((v) => !v)}
              style={{ marginTop: 4, fontSize: 10, fontWeight: 700, color: "#64748b", background: "#f1f5f9", border: "none", borderRadius: 20, padding: "2px 8px", cursor: "pointer" }}
            >
              {showVerbatim ? "Original" : "ES → EN"}
            </button>
          )}
        </>
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

/** Shared customer-copy renderer used by the screen and print/PDF twin. */
function ReportDocument({ job, jobId, businessConfig, logos, reportNotes, reportOptions, reportTechnicians, reportPhotos }: {
  job: Job;
  jobId: string;
  businessConfig: BusinessConfig | null;
  logos: LibraryLogo[];
  reportNotes: string;
  reportOptions: Partial<DocumentOptions>;
  reportTechnicians: string[];
  reportPhotos: ReportPhoto[];
}) {
  const options = normalizeDocumentOptions(reportOptions);
  const sections = reportSections(job.parsed, options);
  const brand = resolveLetterhead(businessConfig ?? {}, logos);
  const meta: [string, string][] = [["Date", new Date().toLocaleDateString("en-US")], ["Reference", jobId]];
  if (job.address) meta.push(["Service at", job.address]);
  if (options.showTechnicians && reportTechnicians.length) meta.push(["Technicians", reportTechnicians.join(", ")]);
  const findings = (job.findings ?? []).filter((finding) => finding.includeInReport).map((finding) => ({ problem: finding.problem, solution: finding.solution }));
  const photoGroups = options.showPhotos ? pairReportPhotos(reportPhotos) : { pairs: [], other: [] };
  return <>
    <DocumentPreview className="report-doc" title="Report" brand={brand} meta={meta}
      billTo={{ name: job.clientName ?? "", address: job.address, phone: job.clientPhone }} narrative={reportNotes}
      findings={findings} sections={sections} />
    {(photoGroups.pairs.length > 0 || photoGroups.other.length > 0) && <section className="report-doc" style={{ marginTop: 20, pageBreakBefore: "always" }}>
      <ReportSection title="Photo documentation">
        {photoGroups.pairs.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          {photoGroups.pairs.flatMap((pair, index) => [
            <ReportPhotoCard key={`problem-${index}`} title="Problem" photo={pair.before} />,
            <ReportPhotoCard key={`corrective-${index}`} title="Corrective action" photo={pair.after} />,
          ])}
        </div>}
        {photoGroups.other.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: photoGroups.pairs.length ? 16 : 0 }}>{photoGroups.other.map((photo, index) => <ReportPhotoCard key={index} title="Photo documentation" photo={photo} />)}</div>}
      </ReportSection>
    </section>}
  </>;
}

function ReportPhotoCard({ title, photo }: { title: string; photo?: ReportPhoto }) {
  if (!photo) return <div aria-label={`${title}: no photo recorded`} style={{ border: "1px dashed #cbd5e1", borderRadius: 8, minHeight: 120, padding: 12, color: "#64748b", fontSize: 12 }}>{title}: no photo recorded</div>;
  return <figure style={{ margin: 0 }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 5 }}>{title}</div>
    {/* Full-resolution report photos are data URIs and cannot be optimized by next/image. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`data:image/jpeg;base64,${photo.fullB64}`} alt={photo.label} style={{ width: "100%", maxHeight: 360, objectFit: "contain", border: "1px solid #e2e8f0", borderRadius: 8 }} />
    <figcaption style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{photo.label}</figcaption>
  </figure>;
}

// Legacy detailed renderer retained temporarily while report documents migrate; ReportDocument above
// is the sole customer-copy renderer.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _ReportRenderer({
  job, jobId, businessConfig, logos, allParsed, reportNotes, reportPhotos,
}: {
  report: string;
  job: Job;
  jobId: string;
  businessConfig: BusinessConfig | null;
  logos: LibraryLogo[];
  allParsed: ParsedUpdate[];
  reportNotes?: string;
  reportPhotos?: Array<{ label: string; fullB64: string }>;
}) {
  const accent = businessConfig?.brandColor ?? "#1e3a5f";
  const bizName = businessConfig?.businessName ?? "Field Report";
  // The cover is a colored bar ("brand-bar" surface) — a mono-dark library logo gets knocked out
  // to white same as the old unconditional filter always did; mono-light needs no filter; a
  // full-color logo gets a white chip instead of the old blanket filter (which used to flatten
  // every logo to a plain white silhouette, real colors lost). No library logo at all (legacy
  // businessConfig.logoUrl, no variant known) keeps that exact old behavior — unaffected.
  const reportLogo = pickDefaultLogo(logos);
  const logoUrl = reportLogo ? logoDataUri(reportLogo) : businessConfig?.logoUrl;
  const logoNeedsChip = reportLogo ? needsLogoChip(reportLogo, "brand-bar") : false;
  const logoFilterStyle: React.CSSProperties = reportLogo ? logoStyle(reportLogo, "brand-bar") : { filter: "brightness(0) invert(1)" };
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
      ["--report-accent" as string]: accent,
    } as React.CSSProperties}>

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
            logoNeedsChip ? (
              <div style={{ background: "#fff", borderRadius: 6, padding: "6px 10px", display: "flex", alignItems: "center" }}>
                <img src={logoUrl} alt={bizName} style={{ height: 28, objectFit: "contain", maxWidth: 100 }} />
              </div>
            ) : (
              <img src={logoUrl} alt={bizName} style={{ height: 44, objectFit: "contain", maxWidth: 120, ...logoFilterStyle }} />
            )
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

        {reportFindings(job.findings).length > 0 && <ReportSection title="Issues found & work performed / recommended">
          <div style={{ display: "grid", gap: 10 }}>
            {reportFindings(job.findings).map((finding) => {
              const sev = SEV_COLOR[finding.severity ?? "low"] ?? SEV_COLOR.low;
              return <div key={finding.findingId} style={{ padding: "12px 16px", background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: 8 }}>
                {finding.severity && <span style={{ color: sev.text, fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>{finding.severity}</span>}
                <div style={{ fontWeight: 700, marginTop: 3 }}>{finding.problem}</div>
                {finding.solution && <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{finding.solution}</div>}
              </div>;
            })}
          </div>
        </ReportSection>}

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

        {/* ── Photo documentation (2 cols x up to 8 rows/page = 16 max, 2 pages) ──
             Fixed-aspect frame + object-fit: contain + a blurred backdrop copy of the same
             image — no crop (the old bug here was a fixed-height box with object-fit: cover),
             no distortion, no dead letterbox space on a portrait photo. */}
        {reportPhotos && reportPhotos.length > 0 && (
          <div style={{ pageBreakBefore: "always", marginTop: 8 }}>
            <ReportSection title="Photo Documentation">
              <div className="rpt-photos">
                {groupAndPadForGrid(reportPhotos).map((ph, i) =>
                  "spacer" in ph ? (
                    <div key={i} className="rpt-photo rpt-photo--spacer" />
                  ) : (
                    <div key={i} className="rpt-photo">
                      <div className="rpt-photo__frame">
                        <img className="rpt-photo__bg" src={`data:image/jpeg;base64,${ph.fullB64}`} alt="" aria-hidden />
                        <img className="rpt-photo__img" src={`data:image/jpeg;base64,${ph.fullB64}`} alt={ph.label} />
                      </div>
                      <div className="rpt-photo__cap">
                        {ph.phase && ph.phase !== "other" && (
                          <span className={`rpt-photo__phase rpt-photo__phase--${ph.phase}`}>{ph.phase}</span>
                        )}
                        <span className="rpt-photo__label">{ph.label}</span>
                      </div>
                    </div>
                  )
                )}
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

// Compact label:value row for the invoice letterhead's Date/Invoice No./Due block — labels in
// the tenant's brand color (bold, right-aligned) so it reads like the printed-invoice reference
// style, values in plain dark text immediately to the right.
function InvoiceMetaRow({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <tr>
      <td style={{ padding: "1px 8px 1px 0", textAlign: "right", fontWeight: 700, color: accent, whiteSpace: "nowrap" }}>{label}:</td>
      <td style={{ padding: "1px 0", textAlign: "left", color: "#1e293b", whiteSpace: "nowrap" }}>{value}</td>
    </tr>
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
