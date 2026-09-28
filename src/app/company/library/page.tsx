"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import type { LibraryPricing, LibraryMaterial, LibraryLaborRate, LibraryDocument, LibraryLogo, Crew, CrewPerson } from "@/types/library";
import type { CustomerSlim } from "@/types/customer";
import type { WorkCatalog } from "@/types/workCatalog";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PageError } from "@/components/ui/PageError";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tooltip } from "@/components/ui/Tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useQuickAddRefresh } from "@/lib/events/quickAdd";
import { CustomersSection } from "./CustomersSection";
import { CrewsSection } from "./CrewsSection";
import { LogosSection } from "./LogosSection";
import { WorkCatalogSection } from "./WorkCatalogSection";
import {
  BadgeDollarSign,
  BookOpen,
  FileText,
  Package,
  Plus,
  Trash2,
} from "lucide-react";

type Section = "customers" | "pricing" | "crews" | "documents" | "branding" | "work-catalog";

export default function LibraryPage() {
  const businessId = useBusinessId();
  const { user } = useAuth();
  const { vocab, isEnabled, industry, ready: modulesReady } = useBusinessModules();
  // The materials/labor catalog only feeds job invoices — an intake business
  // (dental, property mgmt) has no use for it, but still needs the roster + docs.
  const hasPricing = isEnabled("pricing");
  const searchParams = useSearchParams();
  const initialSection = searchParams?.get("section");
  const initialCustomerId = searchParams?.get("customerId");
  const [section, setSection] = useState<Section>(
    initialSection === "pricing" || initialSection === "crews" || initialSection === "documents" || initialSection === "customers" || initialSection === "branding" || initialSection === "work-catalog"
      ? initialSection
      : "customers"
  );
  const [library, setLibrary] = useState<LibraryPricing>({ materials: [], laborRates: [], documents: [] });
  const [crews, setCrews] = useState<Crew[]>([]);
  const [crewPeople, setCrewPeople] = useState<CrewPerson[]>([]);
  const [customers, setCustomers] = useState<CustomerSlim[]>([]);
  const [logos, setLogos] = useState<LibraryLogo[]>([]);
  const [workCatalog, setWorkCatalog] = useState<WorkCatalog>({ items: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loadingKit, setLoadingKit] = useState(false);
  const [kitMessage, setKitMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    Promise.all([
      fetch(`/api/company/library?businessId=${businessId}`).then((r) => {
        if (!r.ok) throw new Error("Library request failed");
        return r.json();
      }),
      fetch(`/api/company/crews?businessId=${businessId}&people=1`).then((r) => {
        if (!r.ok) throw new Error("Crews request failed");
        return r.json();
      }),
      fetch(`/api/company/customers?businessId=${businessId}`).then((r) => {
        if (!r.ok) throw new Error("Customers request failed");
        return r.json();
      }),
      fetch(`/api/company/library/logos?businessId=${businessId}`).then((r) => {
        if (!r.ok) throw new Error("Logos request failed");
        return r.json();
      }),
      fetch(`/api/company/work-catalog?businessId=${businessId}`).then((r) => {
        if (!r.ok) throw new Error("Work catalog request failed");
        return r.json();
      }),
    ])
      .then(([lib, cr, cu, lo, wc]) => {
        setLibrary(lib.library ?? { materials: [], laborRates: [], documents: [] });
        setCrews(cr.crews ?? []);
        setCrewPeople(cr.people ?? []);
        setCustomers(cu.customers ?? []);
        setLogos(lo.logos ?? []);
        setWorkCatalog(wc.catalog ?? { items: [] });
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [businessId]);

  // Picks up a resource added via the global quick-add while sitting on this page.
  useQuickAddRefresh("crew", () => {
    if (!businessId) return;
    fetch(`/api/company/crews?businessId=${businessId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((cr) => setCrews(cr.crews ?? []))
      .catch(() => {});
  });

  // Picks up a material price added via the global quick-add elsewhere (e.g. a job's
  // "No price on file" prompt) while sitting on this page.
  useQuickAddRefresh("material", () => {
    if (!businessId) return;
    fetch(`/api/company/library?businessId=${businessId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((lib) => setLibrary(lib.library ?? { materials: [], laborRates: [], documents: [] }))
      .catch(() => {});
  });

  async function saveLibrary(next: LibraryPricing) {
    const previous = library;
    setLibrary(next);
    setSaved(false);
    setActionError(null);
    try {
      const response = await fetch("/api/company/library", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, ...next }),
      });
      if (!response.ok) throw new Error("Library save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setLibrary(previous);
      setActionError("The library change could not be saved. The previous data is still in effect.");
    }
  }

  async function loadStarterKit() {
    if (!businessId || !industry || !modulesReady || !isEnabled("library")) return;
    setLoadingKit(true);
    setActionError(null);
    setKitMessage(null);
    try {
      const response = await fetch("/api/company/library/starter-kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Starter kit could not be loaded");
      setLibrary(result.library);
      setKitMessage(result.added > 0
        ? `Added ${result.added} starter item${result.added === 1 ? "" : "s"}. Review all templates and placeholder rates before use.`
        : "Starter kit already loaded. Your changes were preserved.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Starter kit could not be loaded.");
    } finally {
      setLoadingKit(false);
    }
  }

  const readOnly = user?.role === "viewer";
  const pricingEmpty = hasPricing && library.materials.length === 0 && library.laborRates.length === 0;

  if (loading) return <PageSkeleton rows={5} />;
  if (loadError) {
    return (
      <PageError
        message="Library data could not be loaded. No pricing, resource, or document data is being shown."
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BookOpen size={20} strokeWidth={1.75} />
            Library
          </h1>
          <p className="page-subtitle">
            {hasPricing
              ? `Pricing, ${vocab.resourceNounPlural.toLowerCase()}, and shared documents. Invoices and reports pull pricing from here automatically.`
              : `Your ${vocab.resourceNounPlural.toLowerCase()} and shared documents. ${vocab.resourceNounPlural} appear as rows on the Calendar.`}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {saved && <span className="status-pill" style={{ background: "#f0fdf4", color: "#15803d", borderColor: "#86efac" }}>✓ Saved</span>}
          {/* Hidden while the empty price list offers the same call, so the screen keeps one primary button. */}
          {modulesReady && industry && isEnabled("library") && !readOnly && !(section === "pricing" && pricingEmpty) && (
            <button type="button" className="button primary" onClick={loadStarterKit} disabled={loadingKit}>
              {loadingKit ? "Loading…" : "Load starter kit"}
            </button>
          )}
        </div>
      </header>

      {kitMessage && <p role="status" style={{ margin: "0 0 16px", color: "var(--accent)" }}>{kitMessage}</p>}
      {hasPricing && <p style={{ margin: "0 0 16px", fontSize: 12, color: "#64748b" }}>Items marked “Starter” carry example prices — edit each price to match your rates before invoicing.</p>}

      {actionError && (
        <div role="alert" style={{ marginBottom: 16, color: "var(--danger)" }}>
          {actionError}
        </div>
      )}

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="segmented-control" aria-label="Library section">
          {(["customers", "pricing", "crews", "documents", "branding", "work-catalog"] as Section[])
            .filter((s) => (s !== "pricing" || hasPricing) && (s !== "work-catalog" || isEnabled("jobs")))
            .map((s) => (
              <button key={s} className="segment" type="button" aria-pressed={section === s} onClick={() => setSection(s)}>
                {s === "customers"
                  ? `${vocab.customerNounPlural} (${customers.length})`
                  : s === "pricing"
                  ? "Pricing"
                  : s === "crews"
                    ? `${vocab.resourceNounPlural} (${crews.length})`
                    : s === "documents"
                      ? `Documents (${library.documents?.length ?? 0})`
                      : s === "work-catalog"
                        ? `Work catalog (${workCatalog.items.length})`
                        : `Branding (${logos.length})`}
              </button>
            ))}
        </div>
      </div>

      {section === "customers" && (
        <CustomersSection
          businessId={businessId}
          customers={customers}
          setCustomers={setCustomers}
          initialCustomerId={initialCustomerId}
        />
      )}
      {section === "pricing" && hasPricing && (
        <PricingSection library={library} onSave={saveLibrary} onLoadExamples={loadStarterKit} loadingKit={loadingKit} readOnly={readOnly} />
      )}
      {section === "crews" && <CrewsSection businessId={businessId} crews={crews} setCrews={setCrews} people={crewPeople} setPeople={setCrewPeople} readOnly={readOnly} />}
      {section === "documents" && <DocumentsSection library={library} onSave={saveLibrary} readOnly={readOnly} />}
      {section === "branding" && <LogosSection businessId={businessId} logos={logos} setLogos={setLogos} readOnly={readOnly} />}
      {section === "work-catalog" && isEnabled("jobs") && (
        <WorkCatalogSection businessId={businessId} catalog={workCatalog} onCatalogChange={setWorkCatalog} readOnly={readOnly} />
      )}
    </>
  );
}

// ── Pricing ───────────────────────────────────────────────────────────────────
function PricingSection({ library, onSave, onLoadExamples, loadingKit, readOnly }: {
  library: LibraryPricing;
  onSave: (l: LibraryPricing) => void;
  onLoadExamples: () => void;
  loadingKit: boolean;
  readOnly: boolean;
}) {
  const { vocab } = useBusinessModules();
  const [materials, setMaterials] = useState<LibraryMaterial[]>(library.materials);
  const [laborRates, setLaborRates] = useState<LibraryLaborRate[]>(library.laborRates);
  const [taxRate, setTaxRate] = useState(String(library.defaultTaxRate ?? ""));

  useEffect(() => {
    setMaterials(library.materials);
    setLaborRates(library.laborRates);
    setTaxRate(String(library.defaultTaxRate ?? ""));
  }, [library]);

  function commit(over?: { materials?: LibraryMaterial[]; laborRates?: LibraryLaborRate[] }) {
    const m = over?.materials ?? materials;
    const l = over?.laborRates ?? laborRates;
    onSave({ ...library, materials: m, laborRates: l, defaultTaxRate: taxRate === "" ? undefined : Number(taxRate) });
  }

  if (materials.length === 0 && laborRates.length === 0) {
    return (
      <section className="panel">
        <EmptyState
          icon={Package}
          title="Add your prices once"
          body={readOnly ? "Ask the owner to add your prices." : "Quotes and invoices fill in from these automatically."}
          action={readOnly ? undefined : { label: loadingKit ? "Loading…" : "Load example prices", onClick: onLoadExamples }}
          secondary={readOnly ? undefined : { label: "Add a price", onClick: () => setMaterials([{ name: "", unit: "", unitPrice: 0 }]) }}
          testId="library-pricing-empty"
        />
      </section>
    );
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Package size={16} strokeWidth={1.75} />
            Material prices
          </h2>
        </div>
        <div className="panel-body">
          <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 12px" }}>When a field update mentions a material with no price, the invoice auto-fills the unit price from here.</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <th style={th}>Material</th><th style={th}>Unit</th><th style={{ ...th, textAlign: "right" }}>Unit price</th><th />
            </tr></thead>
            <tbody>
              {materials.map((m, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={td}><input value={m.name} onChange={(e) => setMaterials(a => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} onBlur={() => commit()} placeholder={vocab.materialPlaceholder} style={cell} />{m.starter && <StarterBadge />}</td>
                  <td style={td}><input value={m.unit} onChange={(e) => setMaterials(a => a.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} onBlur={() => commit()} placeholder="sq / piece" style={cell} /></td>
                  <td style={{ ...td, textAlign: "right" }}>$<input value={String(m.unitPrice)} onChange={(e) => setMaterials(a => a.map((x, j) => j === i ? { ...x, unitPrice: parseFloat(e.target.value) || 0, starter: undefined } : x))} onBlur={() => commit()} placeholder="0.00" style={{ ...cell, width: 80, textAlign: "right" }} /></td>
                  <td style={td}>
                    <Tooltip content="Remove">
                      <button onClick={() => { if (!confirm(`Remove "${m.name || "this material"}"? Invoices will no longer auto-fill its price.`)) return; const next = materials.filter((_, j) => j !== i); setMaterials(next); commit({ materials: next }); }} className="icon-del" aria-label={`Remove ${m.name || "material"}`}>
                        <Trash2 size={14} strokeWidth={1.75} />
                      </button>
                    </Tooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="button small" onClick={() => setMaterials(a => [...a, { name: "", unit: "", unitPrice: 0 }])} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Plus size={13} strokeWidth={1.75} />
            Add material
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <BadgeDollarSign size={16} strokeWidth={1.75} />
            Labor rates &amp; tax
          </h2>
        </div>
        <div className="panel-body">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginBottom: 12 }}>
            <thead><tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <th style={th}>Role</th><th style={{ ...th, textAlign: "right" }}>Rate ($/hr)</th><th />
            </tr></thead>
            <tbody>
              {laborRates.map((l, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={td}><input value={l.role} onChange={(e) => setLaborRates(a => a.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} onBlur={() => commit()} placeholder="Foreman / Laborer" style={cell} />{l.starter && <StarterBadge />}</td>
                  <td style={{ ...td, textAlign: "right" }}>$<input value={String(l.rate)} onChange={(e) => setLaborRates(a => a.map((x, j) => j === i ? { ...x, rate: parseFloat(e.target.value) || 0, starter: undefined } : x))} onBlur={() => commit()} placeholder="65" style={{ ...cell, width: 70, textAlign: "right" }} /></td>
                  <td style={td}>
                    <Tooltip content="Remove">
                      <button onClick={() => { const next = laborRates.filter((_, j) => j !== i); setLaborRates(next); commit({ laborRates: next }); }} className="icon-del" aria-label={`Remove ${l.role || "role rate"}`}>
                        <Trash2 size={14} strokeWidth={1.75} />
                      </button>
                    </Tooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="button small" onClick={() => setLaborRates(a => [...a, { role: "", rate: 0 }])} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Plus size={13} strokeWidth={1.75} />
            Add role rate
          </button>
          <div className="field" style={{ marginTop: 16, maxWidth: 200 }}>
            <label>Default tax rate (%)</label>
            <input type="number" min="0" max="30" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} onBlur={() => commit()} placeholder="0" />
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Crews ─────────────────────────────────────────────────────────────────────
// ── Documents ─────────────────────────────────────────────────────────────────
function DocumentsSection({ library, onSave, readOnly }: { library: LibraryPricing; onSave: (l: LibraryPricing) => void; readOnly: boolean }) {
  const { vocab } = useBusinessModules();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const docs = library.documents ?? [];

  function addLink() {
    if (!name.trim() || !url.trim()) return;
    const doc: LibraryDocument = { docId: `doc_${Date.now()}`, name: name.trim(), url: url.trim(), createdAt: Date.now() };
    onSave({ ...library, documents: [...docs, doc] });
    setName(""); setUrl("");
  }
  function removeDoc(docId: string) {
    onSave({ ...library, documents: docs.filter((d) => d.docId !== docId) });
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <FileText size={16} strokeWidth={1.75} />
          Shared documents
        </h2>
      </div>
      <div className="panel-body">
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 14px" }}>Link warranties, spec sheets, safety docs, or price lists. Paste a shareable URL (Google Drive, Dropbox, etc.) — keeps everything free and accessible everywhere.</p>
        <div style={{ display: "grid", gap: 8, marginBottom: 18 }}>
          {docs.map((d) => (
            <div key={d.docId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#f8fafc", borderRadius: 8 }}>
              <FileText size={18} strokeWidth={1.75} style={{ color: "var(--accent)", flexShrink: 0 }} />
              <a
                href={d.b64 ? `data:${d.mimeType ?? "text/plain"};base64,${d.b64}` : d.url}
                {...(d.b64 ? { download: `${d.name.replace(/[^a-z0-9-]+/gi, "-")}.txt` } : { target: "_blank", rel: "noopener noreferrer" })}
                style={{ flex: 1, fontWeight: 600, fontSize: 14, color: "var(--accent)", textDecoration: "none" }}
              >{d.name} {d.b64 ? "↓" : "↗"}</a>
              <Tooltip content="Remove">
                <button onClick={() => removeDoc(d.docId)} className="icon-del" aria-label={`Remove ${d.name}`}>
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              </Tooltip>
            </div>
          ))}
          {docs.length === 0 && (
            <EmptyState
              compact
              title="No documents yet"
              body={readOnly ? "Ask the owner to add warranties or spec sheets." : "Paste a link below: warranties, spec sheets, price lists."}
              testId="library-documents-empty"
            />
          )}
        </div>
        <div className="form-grid" style={{ alignItems: "end" }}>
          <div className="field"><label>Document name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder={vocab.documentPlaceholder} /></div>
          <div className="field"><label>Link (URL)</label><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></div>
          <div className="field">
            <button className="button primary" onClick={addLink} disabled={!name.trim() || !url.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Plus size={15} strokeWidth={1.75} />
              Add document
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

const th: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 12 };
const td: React.CSSProperties = { padding: "6px 12px" };
const cell: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 8px", fontSize: 13, width: "100%", outline: "none", fontFamily: "inherit" };

// A starter-kit item whose example price the tenant hasn't reviewed yet (cleared on the first price edit).
function StarterBadge() {
  return <span className="chip" style={{ marginLeft: 8, fontSize: 11, whiteSpace: "nowrap" }} title="Example price from the starter kit — edit it to match your rates">Starter — review price</span>;
}
