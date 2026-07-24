"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import type { LibraryPricing, LibraryMaterial, LibraryLaborRate, LibraryDocument, Crew } from "@/types/library";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PageError } from "@/components/ui/PageError";
import {
  BadgeDollarSign,
  BookOpen,
  FileText,
  Package,
  Plus,
  Trash2,
  Users,
} from "lucide-react";

type Section = "pricing" | "crews" | "documents";

export default function LibraryPage() {
  const businessId = useBusinessId();
  const { vocab, isEnabled } = useBusinessModules();
  // The materials/labor catalog only feeds job invoices — an intake business
  // (dental, property mgmt) has no use for it, but still needs the roster + docs.
  const hasPricing = isEnabled("pricing");
  const searchParams = useSearchParams();
  const initialSection = searchParams?.get("section");
  const [section, setSection] = useState<Section>(
    initialSection === "crews" || initialSection === "documents"
      ? initialSection
      : hasPricing
        ? "pricing"
        : "crews"
  );
  const [library, setLibrary] = useState<LibraryPricing>({ materials: [], laborRates: [], documents: [] });
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    Promise.all([
      fetch(`/api/company/library?businessId=${businessId}`).then((r) => {
        if (!r.ok) throw new Error("Library request failed");
        return r.json();
      }),
      fetch(`/api/company/crews?businessId=${businessId}`).then((r) => {
        if (!r.ok) throw new Error("Crews request failed");
        return r.json();
      }),
    ])
      .then(([lib, cr]) => {
        setLibrary(lib.library ?? { materials: [], laborRates: [], documents: [] });
        setCrews(cr.crews ?? []);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [businessId]);

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
        {saved && <span className="status-pill" style={{ background: "#f0fdf4", color: "#15803d", borderColor: "#86efac" }}>✓ Saved</span>}
      </header>

      {actionError && (
        <div role="alert" style={{ marginBottom: 16, color: "var(--danger)" }}>
          {actionError}
        </div>
      )}

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="segmented-control" aria-label="Library section">
          {(["pricing", "crews", "documents"] as Section[])
            .filter((s) => s !== "pricing" || hasPricing)
            .map((s) => (
              <button key={s} className="segment" type="button" aria-pressed={section === s} onClick={() => setSection(s)}>
                {s === "pricing"
                  ? "Pricing"
                  : s === "crews"
                    ? `${vocab.resourceNounPlural} (${crews.length})`
                    : `Documents (${library.documents?.length ?? 0})`}
              </button>
            ))}
        </div>
      </div>

      {section === "pricing" && hasPricing && <PricingSection library={library} onSave={saveLibrary} />}
      {section === "crews" && <CrewsSection businessId={businessId} crews={crews} setCrews={setCrews} />}
      {section === "documents" && <DocumentsSection library={library} onSave={saveLibrary} />}
    </>
  );
}

// ── Pricing ───────────────────────────────────────────────────────────────────
function PricingSection({ library, onSave }: { library: LibraryPricing; onSave: (l: LibraryPricing) => void }) {
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
                  <td style={td}><input value={m.name} onChange={(e) => setMaterials(a => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} onBlur={() => commit()} placeholder={vocab.materialPlaceholder} style={cell} /></td>
                  <td style={td}><input value={m.unit} onChange={(e) => setMaterials(a => a.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} onBlur={() => commit()} placeholder="sq / piece" style={cell} /></td>
                  <td style={{ ...td, textAlign: "right" }}>$<input value={String(m.unitPrice)} onChange={(e) => setMaterials(a => a.map((x, j) => j === i ? { ...x, unitPrice: parseFloat(e.target.value) || 0 } : x))} onBlur={() => commit()} placeholder="0.00" style={{ ...cell, width: 80, textAlign: "right" }} /></td>
                  <td style={td}>
                    <button onClick={() => { if (!confirm(`Remove "${m.name || "this material"}"? Invoices will no longer auto-fill its price.`)) return; const next = materials.filter((_, j) => j !== i); setMaterials(next); commit({ materials: next }); }} className="icon-del" title="Remove" aria-label={`Remove ${m.name || "material"}`}>
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
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
                  <td style={td}><input value={l.role} onChange={(e) => setLaborRates(a => a.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} onBlur={() => commit()} placeholder="Foreman / Laborer" style={cell} /></td>
                  <td style={{ ...td, textAlign: "right" }}>$<input value={String(l.rate)} onChange={(e) => setLaborRates(a => a.map((x, j) => j === i ? { ...x, rate: parseFloat(e.target.value) || 0 } : x))} onBlur={() => commit()} placeholder="65" style={{ ...cell, width: 70, textAlign: "right" }} /></td>
                  <td style={td}>
                    <button onClick={() => { const next = laborRates.filter((_, j) => j !== i); setLaborRates(next); commit({ laborRates: next }); }} className="icon-del" title="Remove" aria-label={`Remove ${l.role || "role rate"}`}>
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
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
// Same palette the API auto-assigns from — keeps manual picks visually consistent
// with newly created crews.
const CREW_COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#dc2626", "#65a30d"];

function CrewsSection({ businessId, crews, setCrews }: { businessId: string | null; crews: Crew[]; setCrews: (c: Crew[]) => void }) {
  const { vocab, isEnabled } = useBusinessModules();
  const resource = vocab.resourceNoun;
  const resources = vocab.resourceNounPlural;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [adding, setAdding] = useState(false);
  const [pickerCrewId, setPickerCrewId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function addCrew() {
    if (!name.trim() || !businessId) return;
    setAdding(true);
    setActionError(null);
    try {
      const res = await fetch("/api/company/crews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, name, email, phone }),
      });
      if (!res.ok) throw new Error("Resource creation failed");
      const data = await res.json();
      if (!data.crew) throw new Error("Resource creation failed");
      setCrews([...crews, data.crew]);
      setName(""); setEmail(""); setPhone("");
    } catch {
      setActionError(`The ${resource.toLowerCase()} could not be added. Try again.`);
    } finally {
      setAdding(false);
    }
  }

  async function removeCrew(crewId: string) {
    const crew = crews.find((c) => c.crewId === crewId);
    if (!confirm(`Remove ${crew?.name ?? `this ${resource.toLowerCase()}`}? They'll disappear from the Calendar.`)) return;
    const previous = crews;
    setCrews(previous.filter((c) => c.crewId !== crewId));
    setActionError(null);
    try {
      const response = await fetch(`/api/company/crews?businessId=${businessId}&crewId=${crewId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Resource deletion failed");
    } catch {
      setCrews(previous);
      setActionError(`The ${resource.toLowerCase()} could not be removed. The roster was restored.`);
    }
  }

  async function setCrewColor(crewId: string, color: string) {
    const previous = crews;
    setCrews(previous.map((c) => (c.crewId === crewId ? { ...c, color } : c)));
    setPickerCrewId(null);
    setActionError(null);
    try {
      const response = await fetch("/api/company/crews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, crewId, color }),
      });
      if (!response.ok) throw new Error("Resource color update failed");
    } catch {
      setCrews(previous);
      setActionError(`The ${resource.toLowerCase()} color could not be saved. The previous color was restored.`);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Users size={16} strokeWidth={1.75} />
          {resources}
        </h2>
      </div>
      <div className="panel-body">
        {actionError && (
          <p role="alert" style={{ color: "var(--danger)", marginTop: 0 }}>
            {actionError}
          </p>
        )}
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 14px" }}>
          {resources} are the rows on your Calendar — drag {isEnabled("jobs") ? `a ${vocab.jobNoun.toLowerCase()}` : "a booking"} onto one to schedule it.
          {isEnabled("jobs") ? " Email is used for branded assignment notices." : ""} Click a color dot to change its Calendar color.
        </p>
        <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
          {crews.map((c) => (
            <div key={c.crewId} style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#f8fafc", borderRadius: 8 }}>
              <button
                onClick={() => setPickerCrewId(pickerCrewId === c.crewId ? null : c.crewId)}
                title="Change color"
                style={{ width: 18, height: 18, borderRadius: "50%", background: c.color, flexShrink: 0, border: "2px solid #fff", boxShadow: "0 0 0 1px #d7dde5", cursor: "pointer", padding: 0 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{[c.email, c.phone].filter(Boolean).join(" · ") || "No contact info"}</div>
              </div>
              <button onClick={() => removeCrew(c.crewId)} className="icon-del" title="Remove" aria-label={`Remove ${c.name}`}>
                <Trash2 size={14} strokeWidth={1.75} />
              </button>

              {pickerCrewId === c.crewId && (
                <>
                  <div onClick={() => setPickerCrewId(null)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
                  <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 14, zIndex: 21, display: "flex", gap: 6, padding: "8px 10px", background: "#fff", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(15,23,42,0.14)" }}>
                    {CREW_COLORS.map((hex) => (
                      <button
                        key={hex}
                        onClick={() => setCrewColor(c.crewId, hex)}
                        title={hex}
                        style={{
                          width: 22, height: 22, borderRadius: "50%", background: hex, cursor: "pointer",
                          border: c.color === hex ? "2px solid #0f172a" : "2px solid transparent",
                          padding: 0,
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
          {crews.length === 0 && <p style={{ fontSize: 13, color: "#94a3b8" }}>No {resources.toLowerCase()} yet. Add your first below.</p>}
        </div>
        <div className="form-grid" style={{ alignItems: "end" }}>
          <div className="field"><label>{resource} name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder={vocab.resourcePlaceholder} /></div>
          <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></div>
          <div className="field"><label>Phone</label><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (305) 555-0100" /></div>
          <div className="field">
            <button className="button primary" onClick={addCrew} disabled={adding || !name.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Plus size={15} strokeWidth={1.75} />
              {adding ? "Adding…" : `Add ${resource.toLowerCase()}`}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Documents ─────────────────────────────────────────────────────────────────
function DocumentsSection({ library, onSave }: { library: LibraryPricing; onSave: (l: LibraryPricing) => void }) {
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
              <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontWeight: 600, fontSize: 14, color: "var(--accent)", textDecoration: "none" }}>{d.name} ↗</a>
              <button onClick={() => removeDoc(d.docId)} className="icon-del" title="Remove" aria-label={`Remove ${d.name}`}>
                <Trash2 size={14} strokeWidth={1.75} />
              </button>
            </div>
          ))}
          {docs.length === 0 && <p style={{ fontSize: 13, color: "#94a3b8" }}>No documents yet.</p>}
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
