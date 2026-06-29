"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";
import type { LibraryPricing, LibraryMaterial, LibraryLaborRate, LibraryDocument, Crew } from "@/types/library";

type Section = "pricing" | "crews" | "documents";

export default function LibraryPage() {
  const businessId = useBusinessId();
  const searchParams = useSearchParams();
  const initialSection = searchParams?.get("section");
  const [section, setSection] = useState<Section>(
    initialSection === "crews" || initialSection === "documents" ? initialSection : "pricing"
  );
  const [library, setLibrary] = useState<LibraryPricing>({ materials: [], laborRates: [], documents: [] });
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    Promise.all([
      fetch(`/api/company/library?businessId=${businessId}`).then((r) => r.json()),
      fetch(`/api/company/crews?businessId=${businessId}`).then((r) => r.json()),
    ])
      .then(([lib, cr]) => {
        setLibrary(lib.library ?? { materials: [], laborRates: [], documents: [] });
        setCrews(cr.crews ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [businessId]);

  async function saveLibrary(next: LibraryPricing) {
    setLibrary(next);
    await fetch("/api/company/library", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, ...next }),
    }).catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) return <div style={{ padding: 32, color: "#666" }}>Loading library…</div>;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Library</h1>
          <p className="page-subtitle">Pricing, crews, and shared documents. Invoices and reports pull pricing from here automatically.</p>
        </div>
        {saved && <span className="status-pill" style={{ background: "#f0fdf4", color: "#15803d", borderColor: "#86efac" }}>✓ Saved</span>}
      </header>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="segmented-control" aria-label="Library section">
          {(["pricing", "crews", "documents"] as Section[]).map((s) => (
            <button key={s} className="segment" type="button" aria-pressed={section === s} onClick={() => setSection(s)}>
              {s === "pricing" ? "Pricing" : s === "crews" ? `Crews (${crews.length})` : `Documents (${library.documents?.length ?? 0})`}
            </button>
          ))}
        </div>
      </div>

      {section === "pricing" && <PricingSection library={library} onSave={saveLibrary} />}
      {section === "crews" && <CrewsSection businessId={businessId} crews={crews} setCrews={setCrews} />}
      {section === "documents" && <DocumentsSection library={library} onSave={saveLibrary} />}
    </>
  );
}

// ── Pricing ───────────────────────────────────────────────────────────────────
function PricingSection({ library, onSave }: { library: LibraryPricing; onSave: (l: LibraryPricing) => void }) {
  const [materials, setMaterials] = useState<LibraryMaterial[]>(library.materials);
  const [laborRates, setLaborRates] = useState<LibraryLaborRate[]>(library.laborRates);
  const [taxRate, setTaxRate] = useState(String(library.defaultTaxRate ?? ""));

  function commit(over?: { materials?: LibraryMaterial[]; laborRates?: LibraryLaborRate[] }) {
    const m = over?.materials ?? materials;
    const l = over?.laborRates ?? laborRates;
    onSave({ ...library, materials: m, laborRates: l, defaultTaxRate: taxRate === "" ? undefined : Number(taxRate) });
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section className="panel">
        <div className="panel-header"><h2 className="panel-title">Material prices</h2></div>
        <div className="panel-body">
          <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 12px" }}>When a field update mentions a material with no price, the invoice auto-fills the unit price from here.</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <th style={th}>Material</th><th style={th}>Unit</th><th style={{ ...th, textAlign: "right" }}>Unit price</th><th />
            </tr></thead>
            <tbody>
              {materials.map((m, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={td}><input value={m.name} onChange={(e) => setMaterials(a => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} onBlur={() => commit()} placeholder="Shingles bundle" style={cell} /></td>
                  <td style={td}><input value={m.unit} onChange={(e) => setMaterials(a => a.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} onBlur={() => commit()} placeholder="sq / piece" style={cell} /></td>
                  <td style={{ ...td, textAlign: "right" }}>$<input value={String(m.unitPrice)} onChange={(e) => setMaterials(a => a.map((x, j) => j === i ? { ...x, unitPrice: parseFloat(e.target.value) || 0 } : x))} onBlur={() => commit()} placeholder="0.00" style={{ ...cell, width: 80, textAlign: "right" }} /></td>
                  <td style={td}><button onClick={() => { if (!confirm(`Remove "${m.name || "this material"}"? Invoices will no longer auto-fill its price.`)) return; const next = materials.filter((_, j) => j !== i); setMaterials(next); commit({ materials: next }); }} className="icon-del" title="Remove">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="button small" onClick={() => setMaterials(a => [...a, { name: "", unit: "", unitPrice: 0 }])}>+ Add material</button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><h2 className="panel-title">Labor rates &amp; tax</h2></div>
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
                  <td style={td}><button onClick={() => { const next = laborRates.filter((_, j) => j !== i); setLaborRates(next); commit({ laborRates: next }); }} className="icon-del" title="Remove">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="button small" onClick={() => setLaborRates(a => [...a, { role: "", rate: 0 }])}>+ Add role rate</button>
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
function CrewsSection({ businessId, crews, setCrews }: { businessId: string | null; crews: Crew[]; setCrews: (c: Crew[]) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [adding, setAdding] = useState(false);

  async function addCrew() {
    if (!name.trim() || !businessId) return;
    setAdding(true);
    const res = await fetch("/api/company/crews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, name, email, phone }),
    });
    const data = await res.json();
    if (res.ok) {
      setCrews([...crews, data.crew]);
      setName(""); setEmail(""); setPhone("");
    }
    setAdding(false);
  }

  async function removeCrew(crewId: string) {
    const crew = crews.find((c) => c.crewId === crewId);
    if (!confirm(`Remove ${crew?.name ?? "this crew"}? They'll disappear from the Calendar Powerboard.`)) return;
    setCrews(crews.filter((c) => c.crewId !== crewId));
    await fetch(`/api/company/crews?businessId=${businessId}&crewId=${crewId}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <section className="panel">
      <div className="panel-header"><h2 className="panel-title">Crews</h2></div>
      <div className="panel-body">
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 14px" }}>Crews appear on the Calendar Powerboard for drag-and-drop scheduling. Email is used for branded assignment notices.</p>
        <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
          {crews.map((c) => (
            <div key={c.crewId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#f8fafc", borderRadius: 8 }}>
              <span style={{ width: 14, height: 14, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{[c.email, c.phone].filter(Boolean).join(" · ") || "No contact info"}</div>
              </div>
              <button onClick={() => removeCrew(c.crewId)} className="icon-del" title="Remove">×</button>
            </div>
          ))}
          {crews.length === 0 && <p style={{ fontSize: 13, color: "#94a3b8" }}>No crews yet. Add your first below.</p>}
        </div>
        <div className="form-grid" style={{ alignItems: "end" }}>
          <div className="field"><label>Crew name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Carlos Crew" /></div>
          <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="carlos@company.com" /></div>
          <div className="field"><label>Phone</label><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (305) 555-0100" /></div>
          <div className="field"><button className="button primary" onClick={addCrew} disabled={adding || !name.trim()}>{adding ? "Adding…" : "+ Add crew"}</button></div>
        </div>
      </div>
    </section>
  );
}

// ── Documents ─────────────────────────────────────────────────────────────────
function DocumentsSection({ library, onSave }: { library: LibraryPricing; onSave: (l: LibraryPricing) => void }) {
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
      <div className="panel-header"><h2 className="panel-title">Shared documents</h2></div>
      <div className="panel-body">
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 14px" }}>Link warranties, spec sheets, safety docs, or price lists. Paste a shareable URL (Google Drive, Dropbox, etc.) — keeps everything free and accessible everywhere.</p>
        <div style={{ display: "grid", gap: 8, marginBottom: 18 }}>
          {docs.map((d) => (
            <div key={d.docId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#f8fafc", borderRadius: 8 }}>
              <span style={{ fontSize: 18 }}>📄</span>
              <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontWeight: 600, fontSize: 14, color: "var(--accent)", textDecoration: "none" }}>{d.name} ↗</a>
              <button onClick={() => removeDoc(d.docId)} className="icon-del" title="Remove">×</button>
            </div>
          ))}
          {docs.length === 0 && <p style={{ fontSize: 13, color: "#94a3b8" }}>No documents yet.</p>}
        </div>
        <div className="form-grid" style={{ alignItems: "end" }}>
          <div className="field"><label>Document name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Shingle warranty 2026" /></div>
          <div className="field"><label>Link (URL)</label><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></div>
          <div className="field"><button className="button primary" onClick={addLink} disabled={!name.trim() || !url.trim()}>+ Add document</button></div>
        </div>
      </div>
    </section>
  );
}

const th: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 12 };
const td: React.CSSProperties = { padding: "6px 12px" };
const cell: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 8px", fontSize: 13, width: "100%", outline: "none", fontFamily: "inherit" };
