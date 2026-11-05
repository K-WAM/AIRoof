"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Sheet } from "@/components/ui/Sheet";
import type { WorkCatalogItem } from "@/types/workCatalog";

export function JobFindingPicker({ open, onClose, items, addedItemIds, loading, error, custom, hasCustom, saving, onSave }: { open: boolean; onClose: () => void; items: WorkCatalogItem[]; addedItemIds: ReadonlySet<string>; loading: boolean; error: string; custom: ReactNode; hasCustom: boolean; saving: boolean; onSave: (items: WorkCatalogItem[]) => Promise<boolean> }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [limit, setLimit] = useState(8);
  useEffect(() => { if (open) { setQuery(""); setSelected([]); setLimit(8); } }, [open]);
  const matches = items.filter(item => `${item.problem} ${item.solution} ${item.category}`.toLowerCase().includes(query.toLowerCase()));
  return <Sheet open={open} onClose={onClose} title="Add a finding">
    <section style={{ display: "grid", gap: 8, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}><h3 style={{ margin: 0, fontSize: 15 }}>Something not in the Library</h3>{custom}</section>
    <label style={{ display: "grid", gap: 8, margin: "16px 0" }}>Or choose from the Library<input aria-label="Search the Library" value={query} onChange={e => { setQuery(e.target.value); setLimit(8); }} placeholder="Search findings" /></label>
    {loading && <p>Loading Library…</p>}{!loading && !matches.length && <p>No matching Library findings. Add your own above.</p>}
    <div className="sheet-list" style={{ display: "grid", gap: 8 }}>{matches.slice(0, limit).map(item => <button key={item.itemId} className="button" style={{ textAlign: "left", height: "auto", minHeight: 44, padding: 12, whiteSpace: "normal" }} disabled={saving || addedItemIds.has(item.itemId)} aria-pressed={selected.includes(item.itemId)} onClick={() => setSelected(ids => ids.includes(item.itemId) ? ids.filter(id => id !== item.itemId) : [...ids, item.itemId])}><span><strong>{item.problem}</strong><br /><small>{item.solution}</small></span><span>{addedItemIds.has(item.itemId) ? "Added" : selected.includes(item.itemId) ? "Selected" : "Select"}</span></button>)}</div>
    {matches.length > limit && <button className="button" onClick={() => setLimit(n => n + 8)}>Show more ({matches.length - limit})</button>}
    {error && <p role="alert">{error}</p>}
    <div className="sheet-footer"><button className="button" disabled={saving} onClick={onClose}>Cancel</button><button className="button primary" disabled={saving || (!hasCustom && !selected.length)} onClick={async () => { if (await onSave(items.filter(item => selected.includes(item.itemId)))) onClose(); }}>{saving ? "Saving…" : "Save findings"}</button></div>
  </Sheet>;
}
