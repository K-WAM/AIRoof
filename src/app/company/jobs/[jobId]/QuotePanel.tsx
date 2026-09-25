"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Job } from "@/types/jobs";
import type { JobQuote, QuoteLine } from "@/types/quote";
import type { JobFinding } from "@/types/workCatalog";
import { quoteTotal, validQuoteLines } from "@/lib/billing/jobQuote";
import { addFindingToQuote, customFinding, findingFromCatalogItem, groupQuoteItems, removeFindingFromQuote } from "@/lib/billing/quoteItems";
import { draftQuoteIntro } from "@/lib/billing/draftQuoteIntro";
import { quoteGroups } from "@/lib/documents/groups";
import { resolveLetterhead } from "@/lib/documents/letterhead";
import { OPTIONS_HEADING } from "@/lib/documents/optionsCopy";
import { DocumentPreview } from "@/lib/documents/DocumentPreview";
import { StatusChip } from "@/components/ui/StatusChip";
import { DocumentOptionToggles } from "@/components/documents/DocumentOptionToggles";
import { FindingPickerSheet } from "@/components/field/FindingPickerSheet";
import { saveToLibrary, SAVED_FROM_JOBS_CATEGORY } from "@/lib/jobs/catalogClient";
import type { BusinessConfig } from "@/types";
import type { LibraryLogo } from "@/types/library";
import type { CatalogState } from "./FindingsPanel";

const AUTOSAVE_MS = 800;
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Number input that lets you type "0." or clear the box without the value snapping back to 0 mid-keystroke. */
function NumberField({ value, onCommit, label, width, disabled, min = 0, step = "0.01" }: {
  value: number; onCommit: (n: number) => void; label: string; width: number; disabled?: boolean; min?: number; step?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => { if (Number(text) !== value) setText(String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input aria-label={label} type="number" min={min} step={step} inputMode="decimal" disabled={disabled} value={text} style={{ width }}
      onChange={(e) => { setText(e.target.value); const n = Number(e.target.value); if (e.target.value.trim() !== "" && Number.isFinite(n)) onCommit(n); }} />
  );
}

export function QuotePanel({ job, businessId, businessConfig, logos, catalog, onStatus, onFindingsChanged }: {
  job: Job;
  businessId: string;
  businessConfig: BusinessConfig | null;
  logos: LibraryLogo[];
  catalog: CatalogState;
  onStatus: (status: Job["status"]) => void;
  onFindingsChanged: (findings: JobFinding[]) => void;
}) {
  const [quote, setQuote] = useState<JobQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  const [to, setTo] = useState(job.clientEmail ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [cProblem, setCProblem] = useState("");
  const [cSolution, setCSolution] = useState("");
  const [cPrice, setCPrice] = useState("");
  const [cSave, setCSave] = useState(false);
  const version = useRef(0);
  const autoCreated = useRef(false);
  const creating = useRef<Promise<JobQuote | null> | null>(null);
  const draft = quote?.status === "draft";

  useEffect(() => {
    let live = true;
    fetch(`/api/jobs/${job.jobId}/quote?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { quote: JobQuote | null }) => { if (live) setQuote(d.quote); })
      .catch(() => { if (live) setError("Could not load quote"); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [businessId, job.jobId]);

  const commit = (next: JobQuote) => { version.current += 1; setQuote(next); setDirty(true); setSaveState("idle"); setError(""); };
  const change = (patch: Partial<JobQuote>) => { if (quote) commit({ ...quote, ...patch }); };
  const changeLine = (lineId: string, patch: Partial<QuoteLine>) => change({ lines: quote?.lines.map((line) => (line.lineId === lineId ? { ...line, ...patch } : line)) });

  /** Creates the draft (server builds it from the job's quote-marked findings) and drafts the intro once, at creation. */
  function createDraft(): Promise<JobQuote | null> {
    // One create at a time: the auto-start and an early "Add item" tap must not both POST.
    if (!creating.current) creating.current = doCreateDraft().finally(() => { creating.current = null; });
    return creating.current;
  }
  async function doCreateDraft(): Promise<JobQuote | null> {
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/jobs/${job.jobId}/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not create quote");
      const created = d.quote as JobQuote;
      const intro = created.status === "draft" && !created.narrative ? draftQuoteIntro(job, created.findings) : "";
      if (intro) { version.current += 1; setQuote({ ...created, narrative: intro }); setDirty(true); return { ...created, narrative: intro }; }
      setQuote(created);
      return created;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create quote"); return null; }
    finally { setBusy(false); }
  }

  // A job with findings already has everything a quote needs: start the draft for the user instead of asking.
  useEffect(() => {
    if (loading || quote || autoCreated.current) return;
    if (!(job.findings ?? []).some((finding) => finding.includeInQuote)) return;
    autoCreated.current = true;
    void createDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, quote, job.findings]);

  async function save(): Promise<boolean> {
    if (!quote) return false;
    if (!validQuoteLines(quote.lines)) { setError("Every line needs a description and a quantity above zero."); return false; }
    const saving = version.current;
    setSaveState("saving"); setError("");
    try {
      const r = await fetch(`/api/jobs/${job.jobId}/quote`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId, lines: quote.lines, findings: quote.findings, notes: quote.notes ?? "", hideMaterials: quote.hideMaterials,
          hideLabor: quote.hideLabor === true, showTechnicians: quote.showTechnicians === true, technicians: quote.technicians ?? [],
          narrative: quote.narrative ?? "",
          // The server refuses a past date; an old quote keeps its stored date instead of failing every autosave.
          ...(quote.validUntil > Date.now() ? { validUntil: quote.validUntil } : {}),
        }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not save quote");
      if (version.current === saving) { setQuote(d.quote); setDirty(false); }
      setSaveState("saved");
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save quote"); setSaveState("idle"); return false; }
  }

  // Autosave the draft shortly after the last edit — nothing to remember to click before sending.
  useEffect(() => {
    if (!dirty || !draft || error) return;
    const timer = window.setTimeout(() => { void save(); }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote, dirty]);

  /** Adds a finding to the quote (creating the draft first if needed) and to the job's own findings. */
  async function addFinding(finding: JobFinding) {
    const base = quote ?? (await createDraft());
    if (!base) return;
    const next = addFindingToQuote(base, finding);
    if (!next.added) return;
    commit({ ...base, findings: next.findings, lines: next.lines });
    const current = job.findings ?? [];
    if (finding.itemId && current.some((existing) => existing.itemId === finding.itemId)) return;
    try {
      const res = await fetch(`/api/jobs/${job.jobId}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, findings: [...current, { ...finding, includeInQuote: true }] }) });
      if (!res.ok) throw new Error();
      onFindingsChanged([...current, { ...finding, includeInQuote: true }]);
    } catch { setError("Added to the quote, but it could not be added to the job's findings (so it won't appear in the report yet)."); }
  }

  async function addCustom() {
    const problem = cProblem.trim();
    if (!problem) { setError("Enter what needs doing."); return; }
    const price = cPrice.trim() === "" ? 0 : Number(cPrice);
    if (!Number.isFinite(price) || price < 0) { setError("Enter the price as a number, or leave it blank."); return; }
    if (cSave && !cSolution.trim()) { setError("Add the work to perform to save this to the Library."); return; }
    let itemId: string | undefined;
    if (cSave) {
      try {
        const item = await saveToLibrary(businessId, { category: SAVED_FROM_JOBS_CATEGORY, problem, solution: cSolution.trim(),
          ...(price > 0 ? { lines: [{ description: problem, quantity: 1, unitPrice: price, kind: "other" as const }] } : {}) });
        catalog.remember(item);
        itemId = item.itemId;
      } catch (e) { setError(`Added to the quote, but could not save it to the Library: ${e instanceof Error ? e.message : "try again"}`); }
    }
    await addFinding(customFinding({ problem, solution: cSolution, price, itemId, category: itemId ? SAVED_FROM_JOBS_CATEGORY : "Custom" }));
    setCProblem(""); setCSolution(""); setCPrice(""); setCSave(false); setCustomOpen(false);
  }

  async function send() {
    if (!quote || !to.trim()) { setError("Enter a recipient email."); return; }
    if (dirty && !(await save())) return;
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/jobs/${job.jobId}/quote/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, to: to.trim() }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Could not send quote");
      setQuote((current) => (current ? { ...current, status: "sent", sentTo: to.trim() } : current));
      if (["open", "inspection"].includes(job.status)) onStatus("quoted");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not send quote"); }
    finally { setBusy(false); }
  }

  async function mark(status: "accepted" | "declined" | "expired") {
    if (!quote) return;
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/jobs/${job.jobId}/quote`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, status }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Could not update quote");
      setQuote(d.quote);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update quote"); }
    finally { setBusy(false); }
  }

  const groups = useMemo(() => (quote ? groupQuoteItems(quote) : []), [quote]);
  const addedItemIds = useMemo(() => new Set((quote?.findings ?? []).flatMap((f) => (f.itemId ? [f.itemId] : []))), [quote?.findings]);
  const total = quote ? quoteTotal(quote.lines) : 0;

  if (loading) return <section className="panel"><div className="panel-body">Loading quote…</div></section>;

  const pickerAndCustom = (
    <>
      {draft || !quote ? (
        <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button primary" type="button" disabled={busy || catalog.loading} onClick={() => setPickerOpen(true)}>＋ Add item</button>
          <button className="button" type="button" disabled={busy} onClick={() => setCustomOpen((open) => !open)}>＋ Custom item</button>
        </div>
      ) : null}
      {customOpen && (
        <div className="no-print" style={{ display: "grid", gap: 8, border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
          <input aria-label="Custom item issue" value={cProblem} onChange={(e) => setCProblem(e.target.value)} placeholder="Issue (what needs doing)" maxLength={1000} />
          <textarea aria-label="Custom item work" value={cSolution} onChange={(e) => setCSolution(e.target.value)} placeholder="Work to perform" rows={2} maxLength={2000} />
          <input aria-label="Custom item price" value={cPrice} onChange={(e) => setCPrice(e.target.value)} placeholder="Price (optional)" inputMode="decimal" style={{ maxWidth: 200 }} />
          <label><input type="checkbox" checked={cSave} onChange={(e) => setCSave(e.target.checked)} /> Save to Library so it&apos;s one tap next time</label>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="button primary" type="button" onClick={() => void addCustom()}>Add to quote</button>
            <button className="button" type="button" onClick={() => setCustomOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );

  return <section className="panel">
    <div className="panel-header no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <h2 className="panel-title">Quote {quote?.quoteId ?? ""}</h2>
      {quote && <span style={{ fontSize: 13, color: "var(--text-muted)" }} aria-live="polite">
        {draft ? (saveState === "saving" ? "Saving…" : dirty ? "Unsaved changes…" : "Saved ✓") : ""}
      </span>}
    </div>
    <div className="panel-body quote-panel-body" style={{ display: "grid", gap: 16 }}>
      <p className="no-print" style={{ margin: 0, color: "var(--text-muted)" }}>
        Quotes cannot be accepted or paid online. Send the quote to the customer, then record their response here.
      </p>

      {!quote ? (
        <>
          <p style={{ margin: 0 }}>{(job.findings ?? []).length === 0
            ? "No quote yet. Add an item from the Library (or a custom one) and the quote is started for you."
            : "Starting the quote from this job's findings…"}</p>
          {pickerAndCustom}
        </>
      ) : <>
        <div className="no-print" style={{ display: "flex", gap: 16, alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <StatusChip status={quote.status} label={quote.status.charAt(0).toUpperCase() + quote.status.slice(1)} />
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Bill to: {quote.billTo.name || "—"}{quote.billTo.address ? ` · ${quote.billTo.address}` : ""}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Estimated total</div>
            <div style={{ fontSize: 28, fontWeight: 800 }} aria-live="polite">{money(total)}</div>
          </div>
        </div>

        <label className="no-print">Valid until <input type="date" disabled={!draft} value={new Date(quote.validUntil).toISOString().slice(0, 10)}
          onChange={(e) => e.target.value && change({ validUntil: new Date(`${e.target.value}T23:59:59`).getTime() })} /></label>
        {quote.validUntil <= Date.now() && draft && <p role="alert" className="no-print" style={{ margin: 0, color: "var(--danger, #b91c1c)" }}>This quote&apos;s valid-until date has passed — pick a new one before sending.</p>}

        <div className="no-print" style={{ display: "grid", gap: 12 }}>
          {groups.length === 0 && <p style={{ margin: 0 }}>No items yet. Add one from the Library — its work and default price fill in automatically.</p>}
          {groups.map((group) => (
            <div key={group.finding?.findingId ?? "other"} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
              {group.finding ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                    <label style={{ flex: 1, fontSize: 12, color: "var(--text-muted)" }}>Issue
                      <textarea aria-label="Issue" rows={2} disabled={!draft} value={group.finding.problem} style={{ width: "100%", display: "block" }}
                        onChange={(e) => change({ findings: quote.findings.map((f) => (f.findingId === group.finding!.findingId ? { ...f, problem: e.target.value } : f)) })} />
                    </label>
                    {draft && <button className="button small" type="button" onClick={() => { const next = removeFindingFromQuote(quote, group.finding!.findingId); change(next); }}>Remove</button>}
                  </div>
                  <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Work
                    <textarea aria-label="Work" rows={2} disabled={!draft} value={group.finding.solution} style={{ width: "100%", display: "block" }}
                      onChange={(e) => change({ findings: quote.findings.map((f) => (f.findingId === group.finding!.findingId ? { ...f, solution: e.target.value } : f)) })} />
                  </label>
                </>
              ) : <strong>Other work</strong>}
              <div style={{ display: "grid", gap: 8 }}>
                {group.lines.map((line) => (
                  <div key={line.lineId} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <select aria-label="Line kind" disabled={!draft} value={line.kind} onChange={(e) => changeLine(line.lineId, { kind: e.target.value as QuoteLine["kind"] })}>
                      <option value="material">Material</option><option value="labor">Labor</option><option value="other">Other</option>
                    </select>
                    <input aria-label="Line description" disabled={!draft} value={line.description} onChange={(e) => changeLine(line.lineId, { description: e.target.value })} style={{ flex: "2 1 160px", minWidth: 0 }} />
                    <NumberField label="Quantity" width={70} min={0.01} disabled={!draft} value={line.quantity} onCommit={(n) => changeLine(line.lineId, { quantity: n })} />
                    <input aria-label="Unit" disabled={!draft} value={line.unit ?? ""} onChange={(e) => changeLine(line.lineId, { unit: e.target.value })} style={{ width: 64 }} />
                    <NumberField label="Unit price" width={86} disabled={!draft} value={line.unitPrice} onCommit={(n) => changeLine(line.lineId, { unitPrice: n })} />
                    <span style={{ minWidth: 72, textAlign: "right", fontWeight: 600 }}>{money(Math.round(line.quantity * line.unitPrice * 100) / 100)}</span>
                    {draft && <button className="button small" type="button" aria-label="Remove line" onClick={() => change({ lines: quote.lines.filter((v) => v.lineId !== line.lineId) })}>✕</button>}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                {draft ? <button className="button small" type="button" onClick={() => change({ lines: [...quote.lines, { lineId: crypto.randomUUID(), ...(group.finding ? { findingId: group.finding.findingId } : {}), kind: "other", description: "", quantity: 1, unitPrice: 0 }] })}>＋ Add line</button> : <span />}
                <strong>{money(quoteTotal(group.lines))}</strong>
              </div>
            </div>
          ))}
        </div>

        {pickerAndCustom}

        <details className="no-print">
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Intro text (optional)</summary>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            <textarea aria-label="Intro text" maxLength={4000} rows={4} disabled={!draft} value={quote.narrative ?? ""} onChange={(e) => change({ narrative: e.target.value })} style={{ width: "100%" }} />
            {draft && <div><button className="button small" type="button" onClick={() => change({ narrative: draftQuoteIntro(job, quote.findings) })}>Rewrite from the items above</button></div>}
          </div>
        </details>

        <details className="no-print">
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>{OPTIONS_HEADING}</summary>
          <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
            <DocumentOptionToggles disabled={!draft}
              values={{ hideMaterials: quote.hideMaterials, hideLabor: quote.hideLabor === true, showTechnicians: quote.showTechnicians === true }}
              onChange={(key, next) => change({ [key]: next } as Partial<JobQuote>)} />
            {quote.showTechnicians && <label>Technicians (comma separated, up to 10)
              <input list="quote-technicians" disabled={!draft} value={(quote.technicians ?? []).join(", ")} style={{ width: "100%", display: "block" }}
                onChange={(event) => change({ technicians: event.target.value.split(",").slice(0, 10).map((name) => name.trim()) })} />
              <datalist id="quote-technicians">{job.parsed?.labor.map((entry, index) => <option key={index} value={entry.description} />)}</datalist>
            </label>}
          </div>
        </details>

        <div className="quote-preview-wrap"><h3 className="no-print">Customer preview</h3><DocumentPreview className="quote-doc" title="Quote" brand={resolveLetterhead(businessConfig ?? {}, logos)}
          meta={[["Date", new Date(quote.createdAt).toLocaleDateString("en-US")], ["Number", quote.quoteId], ["Valid until", new Date(quote.validUntil).toLocaleDateString("en-US")], ["Reference", quote.jobId], ["Service at", job.address ?? ""], ...(quote.showTechnicians && quote.technicians?.length ? [["Technicians", quote.technicians.join(", ")] as [string, string]] : [])]}
          billTo={quote.billTo} narrative={quote.narrative} findings={quote.findings} groups={quoteGroups(quote)} totalLabel="Estimated Total" total={total} /></div>
        <button className="button no-print" type="button" onClick={() => window.print()}>Print / Save as PDF</button>
        <label className="no-print">Notes<textarea disabled={!draft} value={quote.notes ?? ""} onChange={(e) => change({ notes: e.target.value })} rows={3} style={{ display: "block", width: "100%" }} /></label>

        {draft && (
          <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input aria-label="Quote recipient email" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Customer email" style={{ flex: "1 1 220px" }} />
            <button className="button primary" type="button" disabled={busy || quote.lines.length === 0} onClick={() => void send()}>Send quote</button>
            {quote.lines.length === 0 && <small style={{ color: "var(--text-muted)" }}>Add at least one priced item to send.</small>}
          </div>
        )}
        {quote.status === "sent" && (
          <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <small style={{ color: "var(--text-muted)" }}>Sent{quote.sentTo ? ` to ${quote.sentTo}` : ""}. Record their answer:</small>
            <button className="button" type="button" disabled={busy} onClick={() => void mark("accepted")}>Mark accepted</button>
            <button className="button" type="button" disabled={busy} onClick={() => void mark("declined")}>Mark declined</button>
            <button className="button" type="button" disabled={busy} onClick={() => void mark("expired")}>Mark expired</button>
          </div>
        )}
      </>}
      {error && <p role="alert" style={{ color: "var(--danger, #b91c1c)", margin: 0 }}>{error}</p>}
    </div>

    <FindingPickerSheet
      open={pickerOpen}
      onClose={() => setPickerOpen(false)}
      title="Add an item from the Library"
      items={catalog.items}
      loading={catalog.loading}
      error={catalog.error ? "Could not load the Library. Reload the page to retry." : undefined}
      addedItemIds={addedItemIds}
      onPick={async (item) => {
        const full = catalog.items.find((candidate) => candidate.itemId === item.itemId);
        if (full) await addFinding(findingFromCatalogItem(full));
      }}
    />
  </section>;
}
