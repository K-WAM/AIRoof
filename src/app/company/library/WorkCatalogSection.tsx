"use client";

import { useMemo, useState } from "react";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import { Sheet } from "@/components/ui/Sheet";
import { Tooltip } from "@/components/ui/Tooltip";
import { ChevronDown, ChevronRight, ClipboardList, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { WorkCatalog, WorkCatalogItem, WorkCatalogLine, WorkSeverity } from "@/types/workCatalog";

interface Props {
  businessId: string | null;
  catalog: WorkCatalog;
  onCatalogChange: (c: WorkCatalog) => void;
}

const SEVERITIES: readonly { value: WorkSeverity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];
const LINE_KINDS: readonly { value: WorkCatalogLine["kind"]; label: string }[] = [
  { value: "material", label: "Material" },
  { value: "labor", label: "Labor" },
  { value: "other", label: "Other" },
];
const MAX_LINES = 12;

const SEVERITY_STYLE: Record<WorkSeverity, React.CSSProperties> = {
  low: { background: "#f0fdf4", color: "#15803d", borderColor: "#86efac" },
  medium: { background: "#fffbeb", color: "#b45309", borderColor: "#fcd34d" },
  high: { background: "#fef2f2", color: "#b91c1c", borderColor: "#fecaca" },
};

const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

function blankItem(): WorkCatalogItem {
  return { itemId: "", category: "", problem: "", solution: "", lines: [], createdAt: Date.now() };
}

export function WorkCatalogSection({ businessId, catalog, onCatalogChange }: Props) {
  const { vocab } = useBusinessModules();
  const jobNoun = vocab.jobNoun.toLowerCase();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [editing, setEditing] = useState<WorkCatalogItem | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [kitMessage, setKitMessage] = useState<string | null>(null);
  const [loadingKit, setLoadingKit] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog.items;
    return catalog.items.filter((item) =>
      [item.category, item.problem, item.solution, ...(item.lines ?? []).map((l) => l.description)]
        .some((text) => text.toLowerCase().includes(q))
    );
  }, [catalog.items, query]);

  // Categories in first-appearance order (the order the tenant sees in the
  // grouped checklist on a job) — stable across renders.
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const item of filtered) if (!seen.includes(item.category)) seen.push(item.category);
    return seen;
  }, [filtered]);

  async function saveItems(next: WorkCatalogItem[]) {
    if (!businessId) return;
    const previous = catalog.items;
    onCatalogChange({ ...catalog, items: next });
    setActionError(null);
    try {
      const response = await fetch("/api/company/work-catalog", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, items: next }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "The work catalog could not be saved");
      }
    } catch (error) {
      onCatalogChange({ ...catalog, items: previous });
      setActionError(error instanceof Error ? error.message : "The work catalog could not be saved. The previous list was restored.");
    }
  }

  function openNew() {
    setEditing(blankItem());
    setIsNew(true);
    setSheetError(null);
  }

  function openEdit(item: WorkCatalogItem) {
    setEditing({ ...item, lines: (item.lines ?? []).map((l) => ({ ...l })) });
    setIsNew(false);
    setSheetError(null);
  }

  function commitEdit() {
    if (!editing) return;
    const category = editing.category.trim();
    const problem = editing.problem.trim();
    const solution = editing.solution.trim();
    if (!category || !problem || !solution) {
      setSheetError("Category, problem, and solution are all required.");
      return;
    }
    const lines = (editing.lines ?? []).filter((l) => l.description.trim());
    for (const l of lines) {
      if (!(l.quantity > 0)) { setSheetError("Every suggested line needs a quantity greater than zero."); return; }
      if (!(l.unitPrice >= 0)) { setSheetError("Suggested line prices cannot be negative."); return; }
    }
    const cleaned: WorkCatalogItem = {
      itemId: isNew ? crypto.randomUUID() : editing.itemId,
      category,
      problem,
      solution,
      ...(editing.severity ? { severity: editing.severity } : {}),
      ...(lines.length ? { lines: lines.map((l) => ({ ...l, description: l.description.trim() })) } : {}),
      // Any edit clears the starter flag — the item is now the tenant's own.
      createdAt: isNew ? Date.now() : editing.createdAt,
    };
    const next = isNew
      ? [...catalog.items, cleaned]
      : catalog.items.map((item) => (item.itemId === cleaned.itemId ? cleaned : item));
    setEditing(null);
    saveItems(next);
  }

  async function removeItem(item: WorkCatalogItem) {
    if (!confirm(`Remove "${item.problem}"? Jobs can no longer tick this item.`)) return;
    saveItems(catalog.items.filter((i) => i.itemId !== item.itemId));
  }

  async function loadStarterKit() {
    if (!businessId) return;
    setLoadingKit(true);
    setActionError(null);
    setKitMessage(null);
    try {
      const response = await fetch("/api/company/work-catalog/starter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The starter catalog could not be loaded");
      onCatalogChange(result.catalog);
      setKitMessage(result.added > 0
        ? `Added ${result.added} starter item${result.added === 1 ? "" : "s"}. Review each one before use.`
        : "Starter catalog already loaded. Your edits and deletions were preserved.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The starter catalog could not be loaded.");
    } finally {
      setLoadingKit(false);
    }
  }

  const toggleCategory = (category: string) =>
    setCollapsed((c) => (c.includes(category) ? c.filter((x) => x !== category) : [...c, category]));

  return (
    <div>
      <div className="toolbar" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <div style={{ position: "relative", flex: "1 1 240px" }}>
          <Search size={14} strokeWidth={1.75} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search problems, categories, or solutions…"
            style={{ width: "100%", padding: "8px 10px 8px 30px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none" }}
            autoComplete="off"
          />
        </div>
        <button type="button" className="button primary" onClick={openNew} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Plus size={15} strokeWidth={1.75} />
          Add item
        </button>
      </div>

      {catalog.items.length > 0 && (
        <p style={{ margin: "0 0 16px", fontSize: 12, color: "#64748b" }}>
          Suggested lines and prices are examples — review and edit each item to match your services and rates before using them on customer documents.
        </p>
      )}
      {kitMessage && <p role="status" style={{ margin: "0 0 16px", color: "var(--accent)" }}>{kitMessage}</p>}
      {actionError && (
        <div role="alert" style={{ marginBottom: 16, color: "var(--danger)" }}>
          {actionError}
        </div>
      )}

      {catalog.items.length === 0 ? (
        <section className="panel">
          <div className="panel-body" style={{ textAlign: "center", padding: "48px 20px", color: "#94a3b8" }}>
            <ClipboardList size={28} strokeWidth={1.5} style={{ marginBottom: 8, opacity: 0.6 }} />
            <p style={{ fontSize: 13.5, margin: "0 0 6px" }}>No work catalog items yet.</p>
            <p style={{ fontSize: 13, margin: "0 0 18px", maxWidth: 440, marginInline: "auto" }}>
              Add common problems and their standard resolutions here. Tick them on a {jobNoun} to flow them into the report, quote, or invoice.
            </p>
            <button type="button" className="button primary" onClick={loadStarterKit} disabled={loadingKit}>
              {loadingKit ? "Loading…" : "Load starter kit"}
            </button>
          </div>
        </section>
      ) : filtered.length === 0 ? (
        <section className="panel">
          <div className="panel-body" style={{ color: "#94a3b8", fontSize: 13 }}>
            No items match &quot;{query}&quot;.
          </div>
        </section>
      ) : (
        categories.map((category) => {
          const groupItems = filtered.filter((i) => i.category === category);
          const isCollapsed = collapsed.includes(category);
          return (
            <section key={category} className="panel" style={{ marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="panel-header"
                aria-expanded={!isCollapsed}
                style={{ width: "100%", background: "none", border: "none", textAlign: "left", cursor: "pointer", padding: 0 }}
              >
                <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {isCollapsed ? <ChevronRight size={16} strokeWidth={1.75} /> : <ChevronDown size={16} strokeWidth={1.75} />}
                  {category}
                  <span style={{ fontWeight: 400, color: "#94a3b8", fontSize: 12 }}>{groupItems.length}</span>
                </h2>
              </button>
              {!isCollapsed && (
                <div className="panel-body" style={{ display: "grid", gap: 8 }}>
                  {groupItems.map((item) => (
                    <div key={item.itemId} style={{ padding: "10px 14px", background: "#f8fafc", borderRadius: 8 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            {item.severity && (
                              <span className="chip" style={{ ...SEVERITY_STYLE[item.severity], fontSize: 11, whiteSpace: "nowrap" }}>
                                {item.severity}
                              </span>
                            )}
                            <span style={{ fontWeight: 600, fontSize: 14 }}>{item.problem}</span>
                            {item.starter && <StarterBadge />}
                          </div>
                          <p style={{ fontSize: 13, color: "#475569", margin: "4px 0 0", lineHeight: 1.45 }}>{item.solution}</p>
                          {(item.lines ?? []).length > 0 && (
                            <div style={{ display: "grid", gap: 2, marginTop: 6 }}>
                              {(item.lines ?? []).map((l, li) => (
                                <div key={li} style={{ fontSize: 12, color: "#64748b" }}>
                                  {l.kind === "material" ? "Material" : l.kind === "labor" ? "Labor" : "Other"} — {l.description}
                                  <span style={{ color: "#94a3b8" }}> · {l.quantity}{l.unit ? ` ${l.unit}` : ""} × {money(l.unitPrice)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <Tooltip content="Edit">
                            <button type="button" onClick={() => openEdit(item)} aria-label={`Edit ${item.problem}`} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", display: "flex", padding: 4 }}>
                              <Pencil size={14} strokeWidth={1.75} />
                            </button>
                          </Tooltip>
                          <Tooltip content="Remove">
                            <button type="button" onClick={() => removeItem(item)} className="icon-del" aria-label={`Remove ${item.problem}`}>
                              <Trash2 size={14} strokeWidth={1.75} />
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={isNew ? "Add work catalog item" : "Edit work catalog item"}>
        {editing && (
          <div style={{ display: "grid", gap: 14 }}>
            {sheetError && <p role="alert" style={{ color: "var(--danger)", margin: 0, fontSize: 13 }}>{sheetError}</p>}

            <div className="field">
              <label>Category *</label>
              <input
                value={editing.category}
                onChange={(e) => setEditing((d) => (d ? { ...d, category: e.target.value } : d))}
                placeholder="Leaks, Flashing, Storm Damage…"
                maxLength={60}
              />
            </div>
            <div className="field">
              <label>Problem *</label>
              <input
                value={editing.problem}
                onChange={(e) => setEditing((d) => (d ? { ...d, problem: e.target.value } : d))}
                placeholder="Cracked or lifted pipe flashing"
                maxLength={160}
              />
            </div>
            <div className="field">
              <label>Standard resolution *</label>
              <textarea
                value={editing.solution}
                onChange={(e) => setEditing((d) => (d ? { ...d, solution: e.target.value } : d))}
                placeholder="Remove the old collar, clean the pipe, and install a new flashing assembly with sealant."
                rows={3}
                maxLength={1200}
                style={{ resize: "vertical" }}
              />
            </div>
            <div className="field">
              <label>Severity</label>
              <div className="segmented-control">
                <button type="button" className="segment" aria-pressed={!editing.severity} onClick={() => setEditing((d) => (d ? { ...d, severity: undefined } : d))}>
                  None
                </button>
                {SEVERITIES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className="segment"
                    aria-pressed={editing.severity === s.value}
                    onClick={() => setEditing((d) => (d ? { ...d, severity: s.value } : d))}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Suggested lines (examples — {editing.lines?.length ?? 0}/{MAX_LINES})</label>
              <div style={{ display: "grid", gap: 8 }}>
                {(editing.lines ?? []).map((l, li) => (
                  <div key={li} style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    <input
                      value={l.description}
                      onChange={(e) => {
                        const lines = [...(editing.lines ?? [])];
                        lines[li] = { ...lines[li], description: e.target.value };
                        setEditing({ ...editing, lines });
                      }}
                      placeholder="Line description"
                      maxLength={300}
                      style={{ flex: "2 1 180px", minWidth: 0, border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 8px", fontSize: 13, outline: "none" }}
                    />
                    <input
                      type="number"
                      min="1"
                      step="any"
                      value={String(l.quantity)}
                      onChange={(e) => {
                        const lines = [...(editing.lines ?? [])];
                        lines[li] = { ...lines[li], quantity: parseFloat(e.target.value) || 0 };
                        setEditing({ ...editing, lines });
                      }}
                      aria-label="Quantity"
                      placeholder="Qty"
                      style={{ flex: "0 1 70px", minWidth: 0, border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 8px", fontSize: 13, outline: "none" }}
                    />
                    <input
                      value={l.unit ?? ""}
                      onChange={(e) => {
                        const lines = [...(editing.lines ?? [])];
                        lines[li] = { ...lines[li], unit: e.target.value };
                        setEditing({ ...editing, lines });
                      }}
                      placeholder="Unit"
                      maxLength={40}
                      style={{ flex: "0 1 90px", minWidth: 0, border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 8px", fontSize: 13, outline: "none" }}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={String(l.unitPrice)}
                      onChange={(e) => {
                        const lines = [...(editing.lines ?? [])];
                        lines[li] = { ...lines[li], unitPrice: parseFloat(e.target.value) || 0 };
                        setEditing({ ...editing, lines });
                      }}
                      aria-label="Unit price"
                      placeholder="0.00"
                      style={{ flex: "0 1 90px", minWidth: 0, border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 8px", fontSize: 13, outline: "none" }}
                    />
                    <select
                      value={l.kind}
                      onChange={(e) => {
                        const lines = [...(editing.lines ?? [])];
                        lines[li] = { ...lines[li], kind: e.target.value as WorkCatalogLine["kind"] };
                        setEditing({ ...editing, lines });
                      }}
                      aria-label="Line kind"
                      style={{ flex: "0 1 auto", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 6px", fontSize: 13, outline: "none", background: "#fff" }}
                    >
                      {LINE_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>{k.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        const lines = [...(editing.lines ?? [])];
                        lines.splice(li, 1);
                        setEditing({ ...editing, lines });
                      }}
                      className="icon-del"
                      aria-label="Remove line"
                      style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", display: "flex", padding: 4 }}
                    >
                      <X size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                ))}
                {(editing.lines ?? []).length < MAX_LINES && (
                  <button
                    type="button"
                    className="button small"
                    onClick={() => setEditing((d) => (d ? { ...d, lines: [...(d.lines ?? []), { description: "", quantity: 1, unit: "", unitPrice: 0, kind: "material" }] } : d))}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, justifySelf: "start" }}
                  >
                    <Plus size={13} strokeWidth={1.75} />
                    Add line
                  </button>
                )}
              </div>
            </div>

            <div className="button-row">
              <button type="button" className="button primary" onClick={commitEdit}>
                {isNew ? "Add item" : "Save changes"}
              </button>
              <button type="button" className="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
            {!isNew && editing.starter && (
              <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
                Saving clears the “Starter” badge — this item becomes yours to maintain.
              </p>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

// A starter-kit item the tenant hasn't reviewed yet — example wording and
// prices until the first edit, which clears the flag.
function StarterBadge() {
  return (
    <span className="chip" style={{ marginLeft: 2, fontSize: 11, whiteSpace: "nowrap" }} title="From the starter kit — example wording and prices until you edit this item">
      Starter
    </span>
  );
}
