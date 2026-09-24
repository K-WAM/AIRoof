"use client";

import { useEffect, useState } from "react";
import type { Job } from "@/types/jobs";
import type { JobFinding, WorkCatalog, WorkCatalogItem } from "@/types/workCatalog";
import { copyCatalogFinding } from "@/lib/jobs/findings";

export function FindingsPanel({ job, businessId, onSaved }: { job: Job; businessId: string; onSaved: (findings: JobFinding[]) => void }) {
  const [catalog, setCatalog] = useState<WorkCatalog | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [findings, setFindings] = useState<JobFinding[]>(job.findings ?? []);
  const [search, setSearch] = useState("");
  const [newProblem, setNewProblem] = useState("");
  const [newSolution, setNewSolution] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setFindings(job.findings ?? []); setDirty(false); }, [job.findings]);
  useEffect(() => {
    let live = true;
    fetch(`/api/company/work-catalog?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d: { catalog: WorkCatalog }) => { if (live) setCatalog(d.catalog); })
      .catch(() => { if (live) setLoadError(true); });
    return () => { live = false; };
  }, [businessId]);
  const change = (next: JobFinding[]) => { setFindings(next); setDirty(true); setError(""); };
  const toggle = (item: WorkCatalogItem) => {
    change(findings.some((f) => f.itemId === item.itemId)
      ? findings.filter((f) => f.itemId !== item.itemId)
      : [...findings, copyCatalogFinding(item)]);
  };
  const addOneOff = () => {
    if (!newProblem.trim()) { setError("Enter a problem for the one-off finding."); return; }
    change([...findings, { findingId: crypto.randomUUID(), category: "One-off", problem: newProblem.trim(),
      solution: newSolution.trim(), includeInReport: true, includeInQuote: true, addedAt: Date.now() }]);
    setNewProblem(""); setNewSolution("");
  };
  async function save() {
    if (findings.length > 60) { setError("A job can have at most 60 findings."); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/jobs/${job.jobId}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, findings }) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not save findings");
      onSaved(findings); setDirty(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save findings"); }
    finally { setSaving(false); }
  }
  const filtered = (catalog?.items ?? []).filter((item) => `${item.category} ${item.problem} ${item.solution}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const groups = filtered.reduce<Record<string, WorkCatalogItem[]>>((out, item) => {
    (out[item.category] ??= []).push(item);
    return out;
  }, {});
  return <section className="panel no-print"><div className="panel-header"><h2 className="panel-title">Findings</h2></div><div className="panel-body" style={{ display: "grid", gap: 20 }}>
    <p style={{ margin: 0, color: "#64748b" }}>Select catalog findings for this job. Selected wording and prices are saved as a job snapshot.</p>
    {loadError && <p role="alert">Could not load the Work catalog. Retry by reopening this tab.</p>}
    {catalog && catalog.items.length === 0 && <p>The Work catalog is empty. <a href="/company/library?section=work-catalog">Add items in Library → Work catalog</a>.</p>}
    {(catalog?.items.length ?? 0) > 0 && <><input aria-label="Search catalog findings" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search findings" style={{ width: "100%", maxWidth: 420, padding: 10 }} />
      {Object.entries(groups).map(([category, items]) => <div key={category}><h3 style={{ fontSize: 14, margin: "0 0 8px" }}>{category}</h3><div style={{ display: "grid", gap: 8 }}>{items?.map((item) => <label key={item.itemId} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 10, border: "1px solid #e2e8f0", borderRadius: 8 }}><input type="checkbox" checked={findings.some((f) => f.itemId === item.itemId)} onChange={() => toggle(item)} /><span style={{ minWidth: 0, overflowWrap: "anywhere" }}><strong>{item.problem}</strong><br/><small>{item.solution}</small></span></label>)}</div></div>)}
    </>}
    <div><h3 style={{ fontSize: 14 }}>+ Add a one-off finding</h3><div style={{ display: "grid", gap: 8 }}><input aria-label="One-off problem" value={newProblem} onChange={(e) => setNewProblem(e.target.value)} placeholder="Problem" maxLength={1000} style={{ padding: 10 }} /><textarea aria-label="One-off solution" value={newSolution} onChange={(e) => setNewSolution(e.target.value)} placeholder="Work performed or recommended" maxLength={2000} rows={2} style={{ padding: 10 }}/><button className="button" onClick={addOneOff} type="button">Add one-off finding</button></div></div>
    {findings.length > 0 && <div><h3 style={{ fontSize: 14 }}>Selected findings ({findings.length})</h3><div style={{ display: "grid", gap: 12 }}>{findings.map((f) => <div key={f.findingId} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><strong>{f.category}</strong><button className="button" type="button" onClick={() => change(findings.filter((v) => v.findingId !== f.findingId))}>Remove</button></div><textarea aria-label="Finding problem" value={f.problem} maxLength={1000} rows={2} onChange={(e) => change(findings.map((v) => v.findingId === f.findingId ? { ...v, problem: e.target.value } : v))}/><textarea aria-label="Finding solution" value={f.solution} maxLength={2000} rows={2} onChange={(e) => change(findings.map((v) => v.findingId === f.findingId ? { ...v, solution: e.target.value } : v))}/><div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}><label><input type="checkbox" checked={f.includeInReport} onChange={(e) => change(findings.map((v) => v.findingId === f.findingId ? { ...v, includeInReport: e.target.checked } : v))}/> In report</label><label><input type="checkbox" checked={f.includeInQuote} onChange={(e) => change(findings.map((v) => v.findingId === f.findingId ? { ...v, includeInQuote: e.target.checked } : v))}/> In quote</label></div></div>)}</div></div>}
    {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
    <button className="button primary" type="button" onClick={save} disabled={!dirty || saving}>{saving ? "Saving…" : "Save findings"}</button>
  </div></section>;
}
