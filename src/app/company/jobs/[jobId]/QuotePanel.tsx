"use client";

import { useEffect, useState } from "react";
import type { Job } from "@/types/jobs";
import type { JobQuote, QuoteLine } from "@/types/quote";
import { quoteTotal } from "@/lib/billing/jobQuote";
import { quoteGroups } from "@/lib/documents/groups";
import { resolveLetterhead } from "@/lib/documents/letterhead";
import { DocumentPreview } from "@/lib/documents/DocumentPreview";
import type { BusinessConfig } from "@/types";
import type { LibraryLogo } from "@/types/library";
import { Toggle } from "@/components/ui/Toggle";

export function QuotePanel({ job, businessId, businessConfig, logos, onStatus }: { job: Job; businessId: string; businessConfig: BusinessConfig | null; logos: LibraryLogo[]; onStatus: (status: Job["status"]) => void }) {
  const [quote, setQuote] = useState<JobQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [to, setTo] = useState(job.clientEmail ?? "");
  useEffect(() => {
    let live = true;
    fetch(`/api/jobs/${job.jobId}/quote?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d: { quote: JobQuote | null }) => { if (live) setQuote(d.quote); })
      .catch(() => { if (live) setError("Could not load quote"); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [businessId, job.jobId]);
  const change = (patch: Partial<JobQuote>) => { setQuote((q) => q ? { ...q, ...patch } : q); setDirty(true); setError(""); };
  const changeLine = (lineId: string, patch: Partial<QuoteLine>) => change({ lines: quote?.lines.map((line) => line.lineId === lineId ? { ...line, ...patch } : line) });
  async function create() {
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/jobs/${job.jobId}/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Could not create quote");
      setQuote(d.quote);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create quote"); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!quote) return false;
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/jobs/${job.jobId}/quote`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, lines: quote.lines, findings: quote.findings, notes: quote.notes ?? "", hideMaterials: quote.hideMaterials, hideLabor: quote.hideLabor === true, showTechnicians: quote.showTechnicians === true, technicians: quote.technicians ?? [], narrative: quote.narrative ?? "", validUntil: quote.validUntil }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Could not save quote");
      setQuote(d.quote); setDirty(false); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save quote"); return false; }
    finally { setBusy(false); }
  }
  async function send() {
    if (!quote || dirty || !to.trim()) { setError(dirty ? "Save quote changes before sending." : "Enter a recipient email."); return; }
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/jobs/${job.jobId}/quote/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, to: to.trim() }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Could not send quote");
      setQuote({ ...quote, status: "sent", sentTo: to.trim() });
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
  if (loading) return <section className="panel"><div className="panel-body">Loading quote…</div></section>;
  return <section className="panel"><div className="panel-header no-print"><h2 className="panel-title">Quote {quote?.quoteId ?? ""}</h2></div><div className="panel-body quote-panel-body" style={{ display: "grid", gap: 16 }}>
    <p style={{ margin: 0 }}>Quotes cannot be accepted or paid online. Send the quote to the customer, then record their response here.</p>
    {!quote ? <button className="button primary" disabled={busy} onClick={create}>Create draft quote</button> : <>
      <div><strong>Status: {quote.status}</strong><div>Bill to: {quote.billTo.name}{quote.billTo.address ? ` · ${quote.billTo.address}` : ""}</div></div>
      <label>Valid until <input type="date" disabled={quote.status !== "draft"} value={new Date(quote.validUntil).toISOString().slice(0, 10)} onChange={(e) => change({ validUntil: new Date(`${e.target.value}T23:59:59`).getTime() })}/></label>
      {quote.findings.length > 0 && <div><h3>Issues found & work recommended</h3>{quote.findings.map((f) => <div key={f.findingId} style={{ display: "grid", gap: 6, marginBottom: 10 }}><textarea aria-label="Quote finding problem" disabled={quote.status !== "draft"} value={f.problem} onChange={(e) => change({ findings: quote.findings.map((v) => v.findingId === f.findingId ? { ...v, problem: e.target.value } : v) })}/><textarea aria-label="Quote finding solution" disabled={quote.status !== "draft"} value={f.solution} onChange={(e) => change({ findings: quote.findings.map((v) => v.findingId === f.findingId ? { ...v, solution: e.target.value } : v) })}/></div>)}</div>}
      <div><h3>Estimated work</h3><div style={{ display: "grid", gap: 10 }}>{quote.lines.map((line) => <div key={line.lineId} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}><select aria-label="Line kind" disabled={quote.status !== "draft"} value={line.kind} onChange={(e) => changeLine(line.lineId, { kind: e.target.value as QuoteLine["kind"] })}><option value="material">Material</option><option value="labor">Labor</option><option value="other">Other</option></select><input aria-label="Line description" disabled={quote.status !== "draft"} value={line.description} onChange={(e) => changeLine(line.lineId, { description: e.target.value })} style={{ flex: "2 1 180px", minWidth: 0 }}/><input aria-label="Quantity" type="number" min="0.01" step="0.01" disabled={quote.status !== "draft"} value={line.quantity} onChange={(e) => changeLine(line.lineId, { quantity: Number(e.target.value) })} style={{ width: 75 }}/><input aria-label="Unit" disabled={quote.status !== "draft"} value={line.unit ?? ""} onChange={(e) => changeLine(line.lineId, { unit: e.target.value })} style={{ width: 75 }}/><input aria-label="Unit price" type="number" min="0" step="0.01" disabled={quote.status !== "draft"} value={line.unitPrice} onChange={(e) => changeLine(line.lineId, { unitPrice: Number(e.target.value) })} style={{ width: 90 }}/>{quote.status === "draft" && <button className="button" onClick={() => change({ lines: quote.lines.filter((v) => v.lineId !== line.lineId) })}>Remove</button>}</div>)}</div>
      {quote.status === "draft" && <button className="button" onClick={() => change({ lines: [...quote.lines, { lineId: crypto.randomUUID(), kind: "other", description: "", quantity: 1, unitPrice: 0 }] })}>+ Add manual line</button>}</div>
      <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <Toggle checked={quote.hideMaterials} onChange={(checked) => change({ hideMaterials: checked })} label="Hide materials" disabled={quote.status !== "draft"} size="sm" />
        <Toggle checked={quote.hideLabor === true} onChange={(checked) => change({ hideLabor: checked })} label="Hide labor details" disabled={quote.status !== "draft"} size="sm" />
        <Toggle checked={quote.showTechnicians === true} onChange={(checked) => change({ showTechnicians: checked })} label="Show technicians" disabled={quote.status !== "draft"} size="sm" />
      </div>
      <label className="no-print">Description of work<textarea maxLength={4000} rows={4} disabled={quote.status !== "draft"} value={quote.narrative ?? ""} onChange={(event) => change({ narrative: event.target.value })} style={{ width: "100%", display: "block" }} /></label>
      {quote.showTechnicians && <label className="no-print">Technicians (comma separated, up to 10)<input list="quote-technicians" disabled={quote.status !== "draft"} value={(quote.technicians ?? []).join(", ")} onChange={(event) => change({ technicians: event.target.value.split(",").slice(0, 10).map((name) => name.trim()) })} style={{ width: "100%", display: "block" }} /><datalist id="quote-technicians">{job.parsed?.labor.map((entry, index) => <option key={index} value={entry.description} />)}</datalist></label>}
      <div className="quote-preview-wrap"><h3 className="no-print">Customer preview</h3><DocumentPreview className="quote-doc" title="Quote" brand={resolveLetterhead(businessConfig ?? {}, logos)}
        meta={[["Date", new Date(quote.createdAt).toLocaleDateString("en-US")], ["Number", quote.quoteId], ["Valid until", new Date(quote.validUntil).toLocaleDateString("en-US")], ["Reference", quote.jobId], ["Service at", job.address ?? ""], ...(quote.showTechnicians && quote.technicians?.length ? [["Technicians", quote.technicians.join(", ")] as [string, string]] : [])]}
        billTo={quote.billTo} narrative={quote.narrative} findings={quote.findings} groups={quoteGroups(quote)} totalLabel="Estimated Total" total={quoteTotal(quote.lines)} /></div>
      <button className="button no-print" onClick={() => window.print()}>Print / Save as PDF</button>
      <label>Notes<textarea disabled={quote.status !== "draft"} value={quote.notes ?? ""} onChange={(e) => change({ notes: e.target.value })} rows={3} style={{ display: "block", width: "100%" }}/></label>
      {quote.status === "draft" && <><button className="button" disabled={!dirty || busy} onClick={save}>Save draft</button><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input aria-label="Quote recipient email" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Customer email" style={{ flex: "1 1 200px" }}/><button className="button primary" disabled={dirty || busy} onClick={send}>Send quote</button></div></>}
      {quote.status === "sent" && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="button" disabled={busy} onClick={() => mark("accepted")}>Mark accepted</button><button className="button" disabled={busy} onClick={() => mark("declined")}>Mark declined</button><button className="button" disabled={busy} onClick={() => mark("expired")}>Mark expired</button></div>}
    </>}
    {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
  </div></section>;
}
