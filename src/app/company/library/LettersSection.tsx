"use client";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_LETTERS, EXAMPLE_VALUES, LETTER_KINDS, MERGE_FIELDS, renderLetter } from "@/lib/documents/letters";
import { LetterBody } from "@/lib/documents/LetterBody";
import type { LetterKind, LetterTemplate } from "@/types/documentTemplate";

export function LettersSection({ readOnly }: { readOnly: boolean }) {
  const [templates, setTemplates] = useState(DEFAULT_LETTERS);
  const [kind, setKind] = useState<LetterKind>("proposal");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const cursor = useRef<{ index: number; start: number; end: number }>({ index: 0, start: 0, end: 0 });
  const inputs = useRef<Array<HTMLTextAreaElement | null>>([]);
  useEffect(() => {
    let live = true;
    fetch("/api/company/library/letters").then(async r => { if (!r.ok) throw new Error("Could not load letters"); return r.json(); }).then(d => {
      if (live) { setTemplates({ ...DEFAULT_LETTERS, ...Object.fromEntries(d.templates.map((t: LetterTemplate) => [t.kind, t])) }); setLoaded(true); }
    }).catch(() => { if (live) setMessage("Could not load letters. Reload this page to try again."); });
    return () => { live = false; };
  }, []);
  const template = templates[kind];
  const change = (patch: Partial<LetterTemplate>) => { setTemplates(t => ({ ...t, [kind]: { ...t[kind], ...patch } })); setMessage("Unsaved changes"); };
  const changeSection = (index: number, patch: Partial<LetterTemplate["sections"][number]>) => change({ sections: template.sections.map((s, i) => i === index ? { ...s, ...patch } : s) });
  const preview = renderLetter(template, { ...EXAMPLE_VALUES, "signer.name": template.signer?.name || EXAMPLE_VALUES["signer.name"], "signer.title": template.signer?.title || EXAMPLE_VALUES["signer.title"] }, { includeOptional: template.sections.filter(s => s.defaultOn).map(s => s.id) });
  async function save() {
    setBusy(true); setMessage("");
    try {
      const r = await fetch("/api/company/library/letters", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(template) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not save letter");
      setTemplates(t => ({ ...t, [kind]: d.template })); setMessage("Saved");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save letter"); }
    finally { setBusy(false); }
  }
  function insert(key: string) {
    const { index, start, end } = cursor.current;
    const section = template.sections[index];
    if (!section) return;
    const token = `{{${key}}}`;
    changeSection(index, { body: section.body.slice(0, start) + token + section.body.slice(end) });
    requestAnimationFrame(() => { const el = inputs.current[index]; el?.focus(); el?.setSelectionRange(start + token.length, start + token.length); });
  }
  return <section className="panel" aria-label="Letters and notices" style={{ marginBottom: 20 }}>
    <div className="panel-header"><h2>Letters &amp; notices</h2></div>
    <div className="panel-body">
      <label className="field">Letter<select aria-label="Letter" value={kind} onChange={e => { setKind(e.target.value as LetterKind); setMessage(""); cursor.current = { index: 0, start: 0, end: 0 }; }}>{LETTER_KINDS.map(k => <option key={k} value={k}>{DEFAULT_LETTERS[k].title}</option>)}</select></label>
      {message && <p role="status">{message}</p>}
      <fieldset disabled={readOnly || busy || !loaded} style={{ border: 0, padding: 0, minWidth: 0 }}>
        <label className="field">Title<input value={template.title} maxLength={120} onChange={e => change({ title: e.target.value })} /></label>
        <details><summary>Insert a fill-in field</summary><p>Click in a section, then choose a field.</p><div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>{MERGE_FIELDS.map(f => <button key={f.key} className="button" type="button" onClick={() => insert(f.key)}>{f.label}</button>)}</div></details>
        {template.sections.map((section, i) => <div key={section.id} style={{ borderBottom: "1px solid var(--border)", padding: "16px 0" }}>
          <label className="field">Section {i + 1} heading<input value={section.heading ?? ""} maxLength={120} onChange={e => changeSection(i, { heading: e.target.value })} /></label>
          <label className="field">Section {i + 1} text<textarea ref={el => { inputs.current[i] = el; }} rows={4} value={section.body} maxLength={4000} onChange={e => changeSection(i, { body: e.target.value })} onSelect={e => { cursor.current = { index: i, start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }} /></label>
          <label><input type="checkbox" checked={section.optional ?? false} onChange={e => changeSection(i, { optional: e.target.checked })} /> Optional section</label>{section.optional && <label style={{ marginLeft: 12 }}><input type="checkbox" checked={section.defaultOn ?? false} onChange={e => changeSection(i, { defaultOn: e.target.checked })} /> Include by default</label>}
          <button className="button" type="button" onClick={() => change({ sections: template.sections.filter((_, j) => j !== i) })}>Remove section {i + 1}</button>
        </div>)}
        <button className="button" type="button" disabled={template.sections.length >= 20} onClick={() => change({ sections: [...template.sections, { id: `section-${Date.now()}`, body: "" }] })}>Add section</button>
        <div className="form-grid" style={{ marginTop: 16 }}><label className="field">Signer name<input value={template.signer?.name ?? ""} maxLength={120} onChange={e => change({ signer: { name: e.target.value, title: template.signer?.title ?? "" } })} /></label><label className="field">Signer title<input value={template.signer?.title ?? ""} maxLength={120} onChange={e => change({ signer: { name: template.signer?.name ?? "", title: e.target.value } })} /></label></div>
        {!readOnly && <div style={{ display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap" }}><button className="button primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save letter"}</button><button className="button" onClick={() => change(DEFAULT_LETTERS[kind])}>Reset to default</button></div>}
      </fieldset>
      <details open><summary>Preview with example values</summary><article style={{ background: "#fff", color: "#1e293b", padding: 20, border: "1px solid #e2e8f0", overflowWrap: "anywhere" }}><h3>{preview.title}</h3><LetterBody letter={preview} />{template.signer?.name && <p>{template.signer.name}<br />{template.signer.title}</p>}</article>{preview.missing.length > 0 && <p role="status">Unfilled fields: {preview.missing.join(", ")}</p>}</details>
    </div>
  </section>;
}
