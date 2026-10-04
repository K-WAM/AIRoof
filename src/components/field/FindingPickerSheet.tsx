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
  /**
   * Select-then-confirm: taps only tick items, and a pinned "Add N" button saves them all. The field screens use it
   * (2026-09-28: "there is no save button and I cannot see what I added"); the office quote keeps instant add.
   */
  confirm?: { label: (count: number) => string };
}

/**
 * Search-and-tap picker over the Library's work catalog (the Issue -> Work list). Presentational: the office quote
 * and the two field screens each feed it their own items and decide what "pick" does. Shares the Sheet shell.
 */
export function FindingPickerSheet({ open, onClose, title = "Add from Library", items, loading, error, addedItemIds, onPick, confirm }: PickerProps) {
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickError, setPickError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setQuery(""); setPickError(""); setSelected([]); } }, [open]);

  const groups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const matches = needle
      ? items.filter((item) => `${item.category} ${item.problem} ${item.solution ?? ""}`.toLocaleLowerCase().includes(needle))
      : items;
    const byCategory = new Map<string, PickerItem[]>();
    for (const item of matches) byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
    return [...byCategory.entries()];
  }, [items, query]);

  async function saveSelected() {
    if (saving || selected.length === 0) return;
    setSaving(true);
    setPickError("");
    try {
      for (const itemId of selected) {
        const item = items.find((candidate) => candidate.itemId === itemId);
        if (item && !addedItemIds.has(itemId)) await onPick(item);
      }
      setSelected([]);
      onClose();
    } catch (e) {
      setPickError(e instanceof Error ? e.message : "Could not add those findings");
    } finally {
      setSaving(false);
    }
  }

  async function pick(item: PickerItem) {
    if (confirm) {
      if (addedItemIds.has(item.itemId) || saving) return;
      setSelected((prev) => prev.includes(item.itemId) ? prev.filter((id) => id !== item.itemId) : [...prev, item.itemId]);
      return;
    }
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
              const ticked = selected.includes(item.itemId);
              return (
                <button
                  key={item.itemId}
                  type="button"
                  className="button"
                  aria-pressed={confirm ? ticked : undefined}
                  disabled={added || busyId !== null || saving}
                  onClick={() => void pick(item)}
                  style={{ textAlign: "left", minHeight: 44, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", height: "auto", padding: "10px 12px", ...(ticked ? { borderColor: "var(--accent)", boxShadow: "0 0 0 1px var(--accent)" } : {}) }}
                >
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    <strong>{item.problem}</strong>
                    {item.solution && <><br /><small style={{ color: "var(--text-muted)" }}>{item.solution}</small></>}
                  </span>
                  <span aria-hidden style={{ flex: "0 0 auto", fontWeight: 700, color: added ? "var(--text-muted)" : "var(--accent)" }}>
                    {busyId === item.itemId ? "Adding…" : added ? "✓ On this job" : confirm ? (ticked ? "✓ Selected" : "Select") : "＋ Add"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      </div>
      {confirm && (
        <div className="sheet-footer">
          <button type="button" className="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="button primary" onClick={() => void saveSelected()} disabled={saving || selected.length === 0}>
            {saving ? "Adding…" : confirm.label(selected.length)}
          </button>
        </div>
      )}
    </Sheet>
  );
}

/**
 * The field screens' "＋ Finding" control (same look as ＋ Photo). Uses the narrow, field-grant-safe endpoint:
 * the picker sees item NAMES only (no prices) and the server copies the chosen item onto this one job.
 */
export function FieldFindingsButton({ businessId, jobId, disabled, onAdded, showList = true }: {
  businessId: string;
  jobId: string | null;
  disabled?: boolean;
  onAdded?: (problem: string) => void;
  /** False where the screen already lists the job's findings (the field screens' "Work on this job"). */
  showList?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PickerItem[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [onJob, setOnJob] = useState<OnJobFinding[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Loaded with the job (not only when the sheet opens) so the screen can show what is already on it.
  useEffect(() => {
    if (!jobId || !businessId) { setOnJob([]); setAdded(new Set()); return; }
    let live = true;
    setLoading(true);
    setError("");
    fetch(`/api/jobs/${encodeURIComponent(jobId)}/findings?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load the Library"))))
      .then((d: { items: PickerItem[]; findings: Array<{ findingId?: string; itemId?: string; problem?: string; note?: string }> }) => {
        if (!live) return;
        setItems(d.items ?? []);
        setAdded(new Set((d.findings ?? []).flatMap((f) => (f.itemId ? [f.itemId] : []))));
        setOnJob((d.findings ?? []).flatMap((f) => (f.problem ? [{ findingId: f.findingId, problem: f.problem, note: f.note }] : [])));
      })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load the Library"); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [jobId, businessId]);

  async function pick(item: PickerItem) {
    const res = await fetch(`/api/jobs/${encodeURIComponent(jobId!)}/findings`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, itemId: item.itemId }),
    });
    if (!res.ok) throw new Error(res.status === 409 ? "This job already has the maximum number of findings" : "Could not add that finding");
    const saved = await res.json().catch(() => ({})) as { finding?: { findingId?: string } };
    setAdded((prev) => new Set(prev).add(item.itemId));
    setOnJob((prev) => [...prev, { findingId: saved.finding?.findingId, problem: item.problem }]);
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
      {showList && onJob.length > 0 && jobId && (
        <div style={{ margin: "10px 2px 0" }}>
          <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: "#cbd5e1" }}>
            Findings on this job ({onJob.length})
          </p>
          <div style={{ display: "grid", gap: 6 }}>
            {onJob.map((finding, index) => (
              <FindingCommentRow key={finding.findingId ?? index} businessId={businessId} jobId={jobId} finding={finding} disabled={disabled}
                onSaved={(note) => setOnJob((prev) => prev.map((f) => (f === finding ? { ...f, note } : f)))} />
            ))}
          </div>
        </div>
      )}
      <FindingPickerSheet open={open} onClose={() => setOpen(false)} title="Add findings to this job"
        items={items} loading={loading} error={error} addedItemIds={added} onPick={pick}
        confirm={{ label: (count) => count === 0 ? "Select findings to add" : `Add ${count} finding${count === 1 ? "" : "s"}` }} />
    </>
  );
}

export interface OnJobFinding { findingId?: string; problem: string; note?: string; detail?: string }

/**
 * One finding on the field screen, with the inspector's comment ("north slope, about 12 tiles"). The comment prints under
 * the finding on the report and the quote, so the screen says so — no surprise on a customer's document.
 */
export function FindingCommentRow({ businessId, jobId, finding, disabled, onSaved }: {
  businessId: string;
  jobId: string;
  finding: OnJobFinding;
  disabled?: boolean;
  onSaved: (note: string | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(finding.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!finding.findingId || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/findings`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, findingId: finding.findingId, note: draft }),
      });
      const body = await res.json().catch(() => ({})) as { note?: string | null; error?: string };
      if (!res.ok) throw new Error(body.error || "Could not save the comment");
      onSaved(body.note ?? undefined);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the comment");
    } finally {
      setSaving(false);
    }
  }

  const canComment = !!finding.findingId && !disabled;
  return (
    <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(15,23,42,0.6)", border: "1px solid #1e2a4a" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 600, overflowWrap: "anywhere" }}>
          {finding.problem}
          {finding.detail && <span style={{ display: "block", fontSize: 12, fontWeight: 400, color: "#94a3b8" }}>{finding.detail}</span>}
        </span>
        {canComment && !editing && (
          <button type="button" onClick={() => { setDraft(finding.note ?? ""); setEditing(true); }}
            style={{ flex: "0 0 auto", minHeight: 36, padding: "6px 10px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#7dd3fc", fontSize: 13, fontWeight: 700 }}>
            {finding.note ? "Edit" : "＋ Comment"}
          </button>
        )}
      </div>
      {!editing && finding.note && <p style={{ margin: "6px 0 0", fontSize: 13, color: "#94a3b8", whiteSpace: "pre-wrap" }}>{finding.note}</p>}
      {editing && (
        <div style={{ marginTop: 8 }}>
          <textarea aria-label={`Comment on ${finding.problem}`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={1000}
            placeholder="Where, how much, what you saw — e.g. north slope, about 12 cracked tiles"
            style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 8, border: "1px solid #334155", background: "#0b1224", color: "#e2e8f0", fontSize: 14 }} />
          <p style={{ margin: "4px 0 8px", fontSize: 12, color: "#64748b" }}>Shows under this finding on the report and quote.</p>
          {error && <p role="alert" style={{ margin: "0 0 8px", fontSize: 13, color: "#fca5a5" }}>{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setEditing(false)} disabled={saving}
              style={{ flex: 1, minHeight: 44, borderRadius: 10, border: "1px solid #334155", background: "transparent", color: "#cbd5e1", fontWeight: 600 }}>Cancel</button>
            <button type="button" onClick={() => void save()} disabled={saving}
              style={{ flex: 1, minHeight: 44, borderRadius: 10, border: "none", background: "var(--accent)", color: "#fff", fontWeight: 700 }}>
              {saving ? "Saving…" : "Save comment"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
