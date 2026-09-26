"use client";

// Label/phase editing after the fact (Phase 12, Phase 3). A bottom sheet, not the centered
// desktop Modal — editing one photo's metadata is a lightweight, mobile-appropriate action.
//
// Permission split (mirrors the PATCH route): label/phase are saved via verifyFieldAccess (the
// crew who took the photo can fix it), includeInReport via verifyAuthAndRole owner/staff — this
// component always renders the includeInReport toggle when `canCurate` is true and omits it
// otherwise, so a QR crew member never even sees a control the server would reject.

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Toggle } from "@/components/ui/Toggle";
import type { JobPhotoMeta, PhotoPhase } from "@/types/jobs";

const PHASES: PhotoPhase[] = ["before", "after", "other"];

export function PhotoEditSheet({
  photo,
  jobId,
  businessId,
  beforePhotos = [],
  canCurate = false,
  onClose,
  onSaved,
  onDeleted,
}: {
  photo: JobPhotoMeta | null;
  jobId: string;
  businessId: string;
  /** Same-job Before photos only; an After may point to one of them. */
  beforePhotos?: JobPhotoMeta[];
  /** Owner/staff only — gates the includeInReport toggle and Delete. */
  canCurate?: boolean;
  onClose: () => void;
  onSaved: (patch: Omit<Partial<JobPhotoMeta>, "pairId"> & { pairId?: string | null }) => void;
  onDeleted?: () => void;
}) {
  const [label, setLabel] = useState("");
  const [phase, setPhase] = useState<PhotoPhase>("other");
  const [includeInReport, setIncludeInReport] = useState(false);
  const [pairId, setPairId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) return;
    setLabel(photo.label);
    setPhase(photo.phase ?? "other");
    setIncludeInReport(!!photo.includeInReport);
    setPairId(photo.pairId ?? null);
    setError(null);
  }, [photo]);

  async function save() {
    if (!photo || !label.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const patch: Record<string, unknown> = { businessId, label: label.trim(), phase, pairId: phase === "after" ? pairId : null };
      if (canCurate) patch.includeInReport = includeInReport;
      const res = await fetch(`/api/jobs/${jobId}/photos/${photo.photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Save failed");
        return;
      }
      onSaved({ label: label.trim(), phase, pairId: phase === "after" ? pairId : null, ...(canCurate ? { includeInReport } : {}) });
      onClose();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!photo || saving || !confirm("Delete this photo?")) return;
    setSaving(true);
    try {
      await fetch(`/api/jobs/${jobId}/photos/${photo.photoId}?businessId=${businessId}`, { method: "DELETE" });
      onDeleted?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={!!photo} onClose={onClose} title="Edit photo">
      {photo && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <img
            src={`data:image/jpeg;base64,${photo.thumbB64}`}
            alt={photo.label}
            style={{ width: "100%", maxHeight: 260, objectFit: "contain", borderRadius: 12, background: "var(--surface-muted)" }}
          />

          <div className="segmented-control" style={{ width: "100%" }}>
            {PHASES.map((p) => (
              <button
                key={p}
                type="button"
                className="segment"
                style={{ flex: 1, textTransform: "capitalize" }}
                aria-pressed={phase === p}
                onClick={() => setPhase(p)}
              >
                {p}
              </button>
            ))}
          </div>

          <textarea
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Describe this photo"
            enterKeyHint="done"
            rows={2}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 14, resize: "vertical" }}
          />

          {phase === "after" && (
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 650 }}>
              Pairs with…
              <select value={pairId ?? ""} onChange={(event) => setPairId(event.target.value || null)} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)" }}>
                <option value="">No explicit pair (pair by position)</option>
                {beforePhotos.filter((before) => before.photoId !== photo.photoId).map((before) => <option key={before.photoId} value={before.photoId}>{before.label}</option>)}
              </select>
            </label>
          )}

          {canCurate && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Toggle checked={includeInReport} onChange={setIncludeInReport} label="Include in report" />
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Include in report</span>
            </div>
          )}

          {error && <p style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>{error}</p>}

          <div style={{ display: "flex", gap: 10 }}>
            {canCurate && (
              <button
                type="button"
                onClick={remove}
                disabled={saving}
                className="button"
                style={{ color: "var(--danger)", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Trash2 size={15} strokeWidth={1.75} />
                Delete
              </button>
            )}
            <button type="button" onClick={onClose} disabled={saving} className="button" style={{ flex: 1 }}>
              Cancel
            </button>
            <button type="button" onClick={save} disabled={!label.trim() || saving} className="button primary" style={{ flex: 2 }}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
