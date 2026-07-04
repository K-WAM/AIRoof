"use client";

import { useRef, useState } from "react";
import { processPhoto, type ProcessedPhoto } from "@/lib/photos/clientResize";

// Frictionless field photo capture: tap + Photo → pick/snap → required description → save.
// Used by both /field (public) and /company/field (staff). Dark-themed to match.
export function PhotoCapture({
  jobId,
  businessId,
  fieldKey,
  submittedBy,
  disabled,
  onUploaded,
}: {
  jobId: string | null;
  businessId: string;
  /** Per-business field key (from the QR link) — authorizes unauthenticated uploads. */
  fieldKey?: string;
  submittedBy?: string;
  disabled?: boolean;
  onUploaded?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [photo, setPhoto] = useState<ProcessedPhoto | null>(null);
  const [label, setLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setError(null);
    setProcessing(true);
    try {
      const p = await processPhoto(file);
      setPhoto(p);
      setLabel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not process photo");
    } finally {
      setProcessing(false);
    }
  }

  async function save() {
    if (!photo || !jobId || !label.trim() || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/photos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(fieldKey ? { "x-field-key": fieldKey } : {}),
        },
        body: JSON.stringify({ businessId, label: label.trim(), thumbB64: photo.thumbB64, fullB64: photo.fullB64, uploadedBy: submittedBy, w: photo.w, h: photo.h }),
      });
      const data = await res.json();
      if (res.ok) {
        setPhoto(null);
        setLabel("");
        onUploaded?.();
      } else {
        setError(data.error ?? "Upload failed");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onPick} style={{ display: "none" }} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || !jobId || processing}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          width: "100%", padding: "12px", borderRadius: 12,
          border: "1.5px solid #1e2a4a", background: "#0f172a",
          color: disabled || !jobId ? "#334155" : "#7c93c8",
          fontWeight: 600, fontSize: 14, cursor: disabled || !jobId ? "not-allowed" : "pointer",
        }}
      >
        {processing ? "Processing…" : "＋ Photo"}
      </button>

      {/* Description modal — Save disabled until a description is entered */}
      {photo && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 480, background: "#0f172a", borderTop: "1px solid #1e2a4a", borderRadius: "20px 20px 0 0", padding: "20px 16px calc(20px + env(safe-area-inset-bottom,0))" }}>
            <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Add photo</p>
            <img
              src={`data:image/jpeg;base64,${photo.thumbB64}`}
              alt="preview"
              style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 12, marginBottom: 12, border: "1px solid #1e2a4a" }}
            />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Describe this photo (required)…"
              autoFocus
              style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1.5px solid #1e2a4a", background: "#0a0e1a", color: "#f1f5f9", fontSize: 15, outline: "none", marginBottom: 12 }}
            />
            {error && <p style={{ margin: "0 0 10px", fontSize: 13, color: "#fca5a5" }}>{error}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setPhoto(null); setError(null); }} disabled={uploading} style={{ flex: 1, padding: "13px", borderRadius: 12, border: "1.5px solid #334155", background: "transparent", color: "#94a3b8", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Cancel</button>
              <button onClick={save} disabled={!label.trim() || uploading} style={{ flex: 2, padding: "13px", borderRadius: 12, border: "none", background: label.trim() ? "var(--accent)" : "#1e2a4a", color: label.trim() ? "#fff" : "#475569", fontWeight: 700, fontSize: 15, cursor: label.trim() ? "pointer" : "not-allowed" }}>{uploading ? "Saving…" : "Save photo"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
