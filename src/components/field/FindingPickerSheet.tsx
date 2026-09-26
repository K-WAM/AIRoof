"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";

export interface PickerItem {
  itemId: string;
  category: string;
  problem: string;
  solution?: string;
}

interface PickerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  items: PickerItem[];
  loading?: boolean;
  error?: string;
  /** Catalog items already on the job/quote: shown as "Added" and not pickable twice. */
  addedItemIds: ReadonlySet<string>;
  onPick: (item: PickerItem) => Promise<void> | void;
}

/**
 * Search-and-tap picker over the Library's work catalog (the Issue -> Work list). Presentational: the office quote
 * and the two field screens each feed it their own items and decide what "pick" does. Shares the Sheet shell.
 */
export function FindingPickerSheet({ open, onClose, title = "Add from Library", items, loading, error, addedItemIds, onPick }: PickerProps) {
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickError, setPickError] = useState("");

  useEffect(() => { if (open) { setQuery(""); setPickError(""); } }, [open]);

  const groups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const matches = needle
      ? items.filter((item) => `${item.category} ${item.problem} ${item.solution ?? ""}`.toLocaleLowerCase().includes(needle))
      : items;
    const byCategory = new Map<string, PickerItem[]>();
    for (const item of matches) byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
    return [...byCategory.entries()];
  }, [items, query]);

  async function pick(item: PickerItem) {
    if (busyId || addedItemIds.has(item.itemId)) return;
    setBusyId(item.itemId);
    setPickError("");
    try {
      await onPick(item);
    } catch (e) {
      setPickError(e instanceof Error ? e.message : "Could not add that item");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <input
        aria-label="Search the Library"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search issues (e.g. tile, flashing, leak)"
        style={{ width: "100%", padding: 12, marginBottom: 12 }}
      />
      {(error || pickError) && <p role="alert" style={{ color: "var(--danger, #b91c1c)", margin: "0 0 10px" }}>{error || pickError}</p>}
      {loading && <p style={{ color: "var(--text-muted)" }}>Loading the Library…</p>}
      {!loading && !error && items.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>The Library has no items yet. Add some under Library → Work catalog.</p>
      )}
      {!loading && items.length > 0 && groups.length === 0 && <p style={{ color: "var(--text-muted)" }}>Nothing matches &ldquo;{query}&rdquo;.</p>}
      <div className="sheet-list">
      {groups.map(([category, list]) => (
        <div key={category} style={{ marginBottom: 14 }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>{category}</p>
          <div style={{ display: "grid", gap: 8 }}>
            {list.map((item) => {
              const added = addedItemIds.has(item.itemId);
              return (
                <button
                  key={item.itemId}
                  type="button"
                  className="button"
                  disabled={added || busyId !== null}
                  onClick={() => void pick(item)}
                  style={{ textAlign: "left", minHeight: 44, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", height: "auto", padding: "10px 12px" }}
                >
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    <strong>{item.problem}</strong>
                    {item.solution && <><br /><small style={{ color: "var(--text-muted)" }}>{item.solution}</small></>}
                  </span>
                  <span aria-hidden style={{ flex: "0 0 auto", fontWeight: 700, color: added ? "var(--text-muted)" : "var(--accent)" }}>
                    {busyId === item.itemId ? "Adding…" : added ? "✓ Added" : "＋ Add"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      </div>
    </Sheet>
  );
}

/**
 * The field screens' "＋ Finding" control (same look as ＋ Photo). Uses the narrow, field-grant-safe endpoint:
 * the picker sees item NAMES only (no prices) and the server copies the chosen item onto this one job.
 */
export function FieldFindingsButton({ businessId, jobId, disabled, onAdded }: {
  businessId: string;
  jobId: string | null;
  disabled?: boolean;
  onAdded?: (problem: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PickerItem[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !jobId || !businessId) return;
    let live = true;
    setLoading(true);
    setError("");
    fetch(`/api/jobs/${encodeURIComponent(jobId)}/findings?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load the Library"))))
      .then((d: { items: PickerItem[]; findings: Array<{ itemId?: string }> }) => {
        if (!live) return;
        setItems(d.items ?? []);
        setAdded(new Set((d.findings ?? []).flatMap((f) => (f.itemId ? [f.itemId] : []))));
      })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load the Library"); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [open, jobId, businessId]);

  async function pick(item: PickerItem) {
    const res = await fetch(`/api/jobs/${encodeURIComponent(jobId!)}/findings`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, itemId: item.itemId }),
    });
    if (!res.ok) throw new Error(res.status === 409 ? "This job already has the maximum number of findings" : "Could not add that finding");
    setAdded((prev) => new Set(prev).add(item.itemId));
    onAdded?.(item.problem);
  }

  const off = disabled || !jobId;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={off}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          width: "100%", padding: "12px", borderRadius: 12,
          border: "1.5px solid #1e2a4a", background: "#0f172a",
          color: off ? "#334155" : "#7c93c8",
          fontWeight: 600, fontSize: 14, cursor: off ? "not-allowed" : "pointer",
        }}
      >
        ＋ Finding
      </button>
      <FindingPickerSheet open={open} onClose={() => setOpen(false)} title="Add a finding to this job"
        items={items} loading={loading} error={error} addedItemIds={added} onPick={pick} />
    </>
  );
}
