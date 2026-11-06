"use client";
import { useState } from "react";
import type { BillingCompany } from "@/types/company";
import type { LibraryLogo } from "@/types/library";
import { COMPANY_LIMITS, OWNER_COMPANY_FIELDS } from "@/lib/companies/validation";
import { Modal } from "@/components/ui/Modal";
import { FormField } from "@/components/ui/FormField";
import { InlineNotice } from "@/components/ui/InlineNotice";

const LABELS = { id: "Company id", name: "Legal name", shortName: "Short name", address: "Address", phone: "Phone", fax: "Fax (optional)", email: "Email", website: "Website (optional)", license: "License", tagline: "Letterhead slogan (optional)", payInstructions: "Payment instructions", payLink: "Pay link" } as const;
export function CompanyProfiles({ companies, logos, admin, readOnly, onSave }: { companies: BillingCompany[]; logos: LibraryLogo[]; admin?: boolean; readOnly?: boolean; onSave: (next: BillingCompany[]) => Promise<void> }) {
  const [editing, setEditing] = useState<BillingCompany | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(next: BillingCompany[]) {
    setBusy(true); setError("");
    try { await onSave(next); setEditing(null); } catch (e) { setError(e instanceof Error ? e.message : "Could not save companies."); } finally { setBusy(false); }
  }
  return <section className="panel" aria-label="Companies">
    <div className="panel-header"><h2 className="panel-title">Companies</h2></div>
    <div className="panel-body">
      <ul className="stack" style={{ listStyle: "none", padding: 0 }}>{companies.map(c => <li key={c.id}>
        <strong>{c.name}</strong> {c.isDefault && <span className="tag">Default</span>}
        {!readOnly && <> <button type="button" className="button small ghost" onClick={() => { setError(""); setEditingId(c.id); setEditing(c); }}>Edit {c.shortName}</button>
          {admin && !c.isDefault && <button type="button" className="button small ghost" disabled={busy} onClick={() => void save(companies.map(x => ({ ...x, isDefault: x.id === c.id })))}>Set default</button>}</>}
      </li>)}</ul>
      {admin && companies.length < 4 && <button type="button" className="button secondary" onClick={() => { setError(""); setEditingId(null); setEditing({ id: "", name: "", shortName: "", isDefault: companies.length === 0 }); }}>Add company</button>}
      {error && <InlineNotice message={error} />}
    </div>
    <Modal open={!!editing} onClose={() => { if (!busy) setEditing(null); }} title={editing?.name || "Add company"}>
      {editing && <form onSubmit={e => { e.preventDefault(); e.stopPropagation(); void save(editingId ? companies.map(c => c.id === editingId ? editing : c) : [...companies, editing]); }}>
        {Object.entries(LABELS).filter(([key]) => admin || OWNER_COMPANY_FIELDS.includes(key as typeof OWNER_COMPANY_FIELDS[number])).map(([key, label]) => <FormField key={key} label={label}>
          {key === "payInstructions" || key === "address" ? <textarea value={editing[key as keyof BillingCompany] as string || ""} maxLength={COMPANY_LIMITS[key as keyof typeof COMPANY_LIMITS]} onChange={e => setEditing({ ...editing, [key]: e.target.value })} /> :
            <input required={["id", "name", "shortName"].includes(key)} disabled={key === "id" && editingId !== null} value={editing[key as keyof BillingCompany] as string || ""} maxLength={COMPANY_LIMITS[key as keyof typeof COMPANY_LIMITS]} onChange={e => setEditing({ ...editing, [key]: e.target.value })} />}
        </FormField>)}
        <FormField label="Logo"><select value={editing.logoId || ""} onChange={e => setEditing({ ...editing, logoId: e.target.value })}><option value="">Business default</option>{logos.map(l => <option key={l.logoId} value={l.logoId}>{l.name}</option>)}</select></FormField>
        {error && <InlineNotice message={error} />}
        <div className="form-actions"><button className="button" disabled={busy}>{busy ? "Saving..." : "Save"}</button><button type="button" className="button ghost" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div>
      </form>}
    </Modal>
  </section>;
}
