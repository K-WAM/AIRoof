"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Job } from "@/types/jobs";
import type { JobFinding, WorkCatalogItem } from "@/types/workCatalog";
import { copyCatalogFinding } from "@/lib/jobs/findings";
import { suggestFindings } from "@/lib/jobs/suggestFindings";
import { customFinding } from "@/lib/billing/quoteItems";
import { workBullet } from "@/lib/documents/workSummary";
import { saveToLibrary, SAVED_FROM_JOBS_CATEGORY } from "@/lib/jobs/catalogClient";
import { FindingPickerSheet } from "@/components/field/FindingPickerSheet";

export interface CatalogState {
  items: WorkCatalogItem[];
  loading: boolean;
  error: boolean;
  remember: (item: WorkCatalogItem) => void;
}

const AUTOSAVE_MS = 800;

export function FindingsPanel({ job, businessId, catalog, onSaved }: {
  job: Job;
  businessId: string;
  catalog: CatalogState;
  onSaved: (findings: JobFinding[]) => void;
}) {
  const [findings, setFindings] = useState<JobFinding[]>(job.findings ?? []);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newProblem, setNewProblem] = useState("");
  const [newSolution, setNewSolution] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [saveToLib, setSaveToLib] = useState(false);
  const [adding, setAdding] = useState(false);
  const version = useRef(0);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  // Follow the job's findings (a refresh or another tab) — but never while there are unsaved local edits.
  useEffect(() => {
    if (!dirtyRef.current) setFindings(job.findings ?? []);
  }, [job.findings]);

  const change = (next: JobFinding[]) => {
    version.current += 1;
    setFindings(next);
    setDirty(true);
    setStatus("idle");
    setError("");
  };

  async function save(): Promise<void> {
    if (findings.length > 60) { setError("A job can have at most 60 findings."); setStatus("error"); return; }
    const saving = version.current;
    setStatus("saving");
    try {
      const res = await fetch(`/api/jobs/${job.jobId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, findings }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not save findings");
      onSaved(findings);
      if (version.current === saving) { setDirty(false); setStatus("saved"); }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save findings");
      setStatus("error");
    }
  }

  // Autosave shortly after the last change — there is no Save button to forget.
  useEffect(() => {
    if (!dirty || status === "error") return;
    const timer = window.setTimeout(() => { void save(); }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findings, dirty]);

  const onJobIds = useMemo(() => new Set(findings.flatMap((f) => (f.itemId ? [f.itemId] : []))), [findings]);
  const suggestions = useMemo(() => suggestFindings({ ...job, findings }, catalog.items), [job, findings, catalog.items]);
  const issueFor = (item: WorkCatalogItem) => {
    const words = new Set(`${item.category} ${item.problem}`.toLocaleLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
    return (job.parsed?.issues ?? []).find((issue) => issue.description.toLocaleLowerCase().split(/[^a-z0-9]+/).some((w) => words.has(w)))?.description;
  };

  const addCatalogItem = (item: WorkCatalogItem) => {
    if (onJobIds.has(item.itemId)) return;
    change([...findings, copyCatalogFinding(item)]);
  };

  async function addOneOff() {
    const problem = newProblem.trim();
    if (!problem) { setError("Enter what was found."); return; }
    const price = newPrice.trim() === "" ? 0 : Number(newPrice);
    if (!Number.isFinite(price) || price < 0) { setError("Enter the price as a number, or leave it blank."); return; }
    if (saveToLib && !newSolution.trim()) { setError("Add the work to perform to save this to the Library."); return; }
    setAdding(true);
    setError("");
    let itemId: string | undefined;
    if (saveToLib) {
      try {
        const item = await saveToLibrary(businessId, {
          category: SAVED_FROM_JOBS_CATEGORY, problem, solution: newSolution.trim(),
          ...(price > 0 ? { lines: [{ description: problem, quantity: 1, unitPrice: price, kind: "other" as const }] } : {}),
        });
        catalog.remember(item);
        itemId = item.itemId;
      } catch (e) {
        setError(`Added to this job, but could not save it to the Library: ${e instanceof Error ? e.message : "try again"}`);
      }
    }
    change([...findings, customFinding({ problem, solution: newSolution, price, itemId, category: itemId ? SAVED_FROM_JOBS_CATEGORY : "One-off" })]);
    setNewProblem(""); setNewSolution(""); setNewPrice(""); setSaveToLib(false);
    setAdding(false);
  }

  const patch = (findingId: string, next: Partial<JobFinding>) => change(findings.map((f) => (f.findingId === findingId ? { ...f, ...next } : f)));

  return (
    <section className="panel no-print">
      <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h2 className="panel-title">Findings</h2>
        <span style={{ fontSize: 13, color: status === "error" ? "var(--danger, #b91c1c)" : "var(--text-muted)" }} aria-live="polite">
          {status === "saving" ? "Saving…" : status === "saved" && !dirty ? "Saved ✓" : dirty ? "Unsaved changes…" : ""}
        </span>
      </div>
      <div className="panel-body" style={{ display: "grid", gap: 20 }}>
        <p style={{ margin: 0, color: "var(--text-muted)" }}>
          What was found on this job. Each finding brings its standard fix and price into the quote and the report, and is saved as a snapshot of the Library wording.
        </p>

        {suggestions.length > 0 && (
          <div style={{ border: "1px solid var(--accent)", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
            <strong>From the field notes</strong>
            {suggestions.map((item) => (
              <div key={item.itemId} style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                  {issueFor(item) && <><small style={{ color: "var(--text-muted)" }}>&ldquo;{issueFor(item)}&rdquo;</small><br /></>}
                  <strong>{item.problem}</strong>
                </span>
                <button className="button small" type="button" onClick={() => addCatalogItem(item)}>＋ Add</button>
              </div>
            ))}
          </div>
        )}

        <div>
          <button className="button primary" type="button" onClick={() => setPickerOpen(true)} disabled={catalog.loading}>
            ＋ Add from Library
          </button>
          {catalog.error && <p role="alert" style={{ color: "var(--danger, #b91c1c)" }}>Could not load the Library. Reload the page to retry.</p>}
        </div>

        {findings.length > 0 ? (
          <div style={{ display: "grid", gap: 12 }}>
            <h3 style={{ fontSize: 14, margin: 0 }}>On this job ({findings.length})</h3>
            {findings.map((f) => (
              <div key={f.findingId} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 15 }}>{workBullet(f) || f.category}</strong>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{f.category}</div>
                  </div>
                  <button className="button small" type="button" onClick={() => change(findings.filter((v) => v.findingId !== f.findingId))}>Remove</button>
                </div>
                <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Issue
                  <textarea aria-label="Finding problem" value={f.problem} maxLength={1000} rows={2} style={{ width: "100%", display: "block" }}
                    onChange={(e) => patch(f.findingId, { problem: e.target.value })} />
                </label>
                <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Work
                  <textarea aria-label="Finding solution" value={f.solution} maxLength={2000} rows={2} style={{ width: "100%", display: "block" }}
                    onChange={(e) => patch(f.findingId, { solution: e.target.value })} />
                </label>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <label><input type="checkbox" checked={f.includeInReport} onChange={(e) => patch(f.findingId, { includeInReport: e.target.checked })} /> In report</label>
                  <label><input type="checkbox" checked={f.includeInQuote} onChange={(e) => patch(f.findingId, { includeInQuote: e.target.checked })} /> In quote</label>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0 }}>No findings yet. Add one from the Library, or from a suggestion once the technician reports an issue.</p>
        )}

        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>＋ Something not in the Library</summary>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <input aria-label="One-off problem" value={newProblem} onChange={(e) => setNewProblem(e.target.value)} placeholder="What was found" maxLength={1000} />
            <textarea aria-label="One-off solution" value={newSolution} onChange={(e) => setNewSolution(e.target.value)} placeholder="Work to perform" maxLength={2000} rows={2} />
            <input aria-label="One-off price" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="Price (optional)" inputMode="decimal" style={{ maxWidth: 200 }} />
            <label><input type="checkbox" checked={saveToLib} onChange={(e) => setSaveToLib(e.target.checked)} /> Save to Library so it&apos;s one tap next time</label>
            <div><button className="button" type="button" onClick={() => void addOneOff()} disabled={adding}>{adding ? "Adding…" : "Add finding"}</button></div>
          </div>
        </details>

        {error && <p role="alert" style={{ color: "var(--danger, #b91c1c)", margin: 0 }}>{error}</p>}
        {status === "error" && <div><button className="button" type="button" onClick={() => void save()}>Retry save</button></div>}
      </div>

      <FindingPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add a finding from the Library"
        items={catalog.items}
        loading={catalog.loading}
        addedItemIds={onJobIds}
        onPick={(item) => { const full = catalog.items.find((c) => c.itemId === item.itemId); if (full) addCatalogItem(full); }}
      />
    </section>
  );
}
