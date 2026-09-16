"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import type { LibraryLogo } from "@/types/library";
import { logoDataUri, logoStyle, needsLogoChip, MAX_LOGOS } from "@/lib/branding/logo";
import { processLogo } from "@/lib/photos/clientResize";
import { useBootstrap } from "@/contexts/BootstrapContext";
import { Tooltip } from "@/components/ui/Tooltip";

const VARIANT_LABEL: Record<LibraryLogo["variant"], string> = {
  color: "Full color",
  "mono-dark": "Single color (dark)",
  "mono-light": "Single color (light)",
};
const VARIANT_HINT: Record<LibraryLogo["variant"], string> = {
  color: "The real mark, natural colors. Best for the invoice's white header.",
  "mono-dark": "A dark silhouette — gets knocked out to white on a colored bar (emails, report cover).",
  "mono-light": "Already light/white — used as-is on a colored bar, no filter applied.",
};

/**
 * Upload, preview, and manage the tenant's logo library (Phase 12, Phase 4
 * remainder) — separate from the single businessConfig.logoUrl Settings has
 * always had (still the fallback everywhere a default logo isn't set here).
 * Each card previews on both surfaces a logo actually appears on so the owner
 * can see, not guess, whether "color" or "mono-dark" is the right variant.
 */
export function LogosSection({
  businessId, logos, setLogos,
}: {
  businessId: string | null;
  logos: LibraryLogo[];
  setLogos: (l: LibraryLogo[]) => void;
}) {
  const { data: bootstrap } = useBootstrap();
  const brandColor = bootstrap?.business.brandColor || "#0f172a";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState("");
  const [pendingVariant, setPendingVariant] = useState<LibraryLogo["variant"]>("color");

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !businessId) return;
    setError(null);
    if (logos.length >= MAX_LOGOS) {
      setError(`You can keep at most ${MAX_LOGOS} logos — remove one first.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploading(true);
    try {
      const processed = await processLogo(file);
      const res = await fetch("/api/company/library/logos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          name: pendingName.trim() || file.name.replace(/\.[^.]+$/, ""),
          variant: pendingVariant,
          ...processed,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setLogos([...logos, data.logo]);
      setPendingName("");
      setPendingVariant("color");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That logo could not be uploaded.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function setDefault(logoId: string) {
    if (!businessId) return;
    setBusyId(logoId);
    setError(null);
    const previous = logos;
    setLogos(logos.map((l) => ({ ...l, isDefault: l.logoId === logoId })));
    try {
      const res = await fetch("/api/company/library/logos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, logoId, isDefault: true }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setLogos(previous);
      setError("Could not set that as the default logo.");
    } finally {
      setBusyId(null);
    }
  }

  async function setVariant(logoId: string, variant: LibraryLogo["variant"]) {
    if (!businessId) return;
    setBusyId(logoId);
    setError(null);
    const previous = logos;
    setLogos(logos.map((l) => (l.logoId === logoId ? { ...l, variant } : l)));
    try {
      const res = await fetch("/api/company/library/logos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, logoId, variant }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setLogos(previous);
      setError("Could not change that logo's variant.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(logo: LibraryLogo) {
    if (!businessId) return;
    if (!confirm(`Remove "${logo.name}"? This can't be undone.`)) return;
    setBusyId(logo.logoId);
    setError(null);
    const previous = logos;
    setLogos(logos.filter((l) => l.logoId !== logo.logoId));
    try {
      const res = await fetch(`/api/company/library/logos?businessId=${businessId}&logoId=${logo.logoId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setLogos(previous);
      setError("Could not remove that logo.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ImagePlus size={16} strokeWidth={1.75} />
          Logos
        </h2>
      </div>
      <div className="panel-body">
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 14px" }}>
          Upload up to {MAX_LOGOS} logos. The one marked <strong>Default</strong> is what appears on invoices,
          the job report cover, and emailed notifications. PNG keeps a transparent background — never flattened
          to a white box. SVG is kept as a real vector, not rasterized.
        </p>

        {error && (
          <p role="alert" style={{ margin: "0 0 14px", fontSize: 12, color: "#b91c1c" }}>{error}</p>
        )}

        {logos.length === 0 ? (
          <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 18 }}>No logos yet — upload one below.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, marginBottom: 22 }}>
            {logos.map((logo) => (
              <div key={logo.logoId} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, opacity: busyId === logo.logoId ? 0.6 : 1 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  {/* "light" preview — the invoice's actual white header */}
                  <div style={{ flex: 1, height: 64, borderRadius: 6, border: "1px solid #f1f5f9", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <img src={logoDataUri(logo)} alt={`${logo.name} on white`} style={{ maxHeight: 40, maxWidth: "80%", objectFit: "contain", ...logoStyle(logo, "light") }} />
                  </div>
                  {/* "brand-bar" preview — the emailed header / report cover */}
                  <div style={{ flex: 1, height: 64, borderRadius: 6, background: brandColor, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {needsLogoChip(logo, "brand-bar") ? (
                      <div style={{ background: "#fff", borderRadius: 6, padding: "6px 10px", display: "flex", alignItems: "center" }}>
                        <img src={logoDataUri(logo)} alt={`${logo.name} on brand color`} style={{ maxHeight: 24, maxWidth: 70, objectFit: "contain" }} />
                      </div>
                    ) : (
                      <img src={logoDataUri(logo)} alt={`${logo.name} on brand color`} style={{ maxHeight: 40, maxWidth: "80%", objectFit: "contain", ...logoStyle(logo, "brand-bar") }} />
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {logo.name}
                  </div>
                  <Tooltip content={logo.isDefault ? "This is the default logo" : "Make this the default"}>
                    <button
                      type="button"
                      disabled={logo.isDefault || busyId === logo.logoId}
                      onClick={() => setDefault(logo.logoId)}
                      aria-label={logo.isDefault ? "Default logo" : `Make ${logo.name} the default`}
                      style={{ background: "none", border: "none", padding: 0, cursor: logo.isDefault ? "default" : "pointer", display: "inline-flex", color: logo.isDefault ? "#d97706" : "#cbd5e1" }}
                    >
                      <Star size={16} strokeWidth={1.75} fill={logo.isDefault ? "#d97706" : "none"} />
                    </button>
                  </Tooltip>
                </div>
                <select
                  value={logo.variant}
                  disabled={busyId === logo.logoId}
                  onChange={(e) => setVariant(logo.logoId, e.target.value as LibraryLogo["variant"])}
                  title={VARIANT_HINT[logo.variant]}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12, marginBottom: 8 }}
                >
                  {(Object.keys(VARIANT_LABEL) as LibraryLogo["variant"][]).map((v) => (
                    <option key={v} value={v}>{VARIANT_LABEL[v]}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="button ghost small"
                  disabled={busyId === logo.logoId}
                  onClick={() => remove(logo)}
                  style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#b91c1c" }}
                >
                  <Trash2 size={13} strokeWidth={1.75} />
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {logos.length < MAX_LOGOS && (
          <div className="form-grid" style={{ alignItems: "end" }}>
            <div className="field">
              <label>Name</label>
              <input value={pendingName} onChange={(e) => setPendingName(e.target.value)} placeholder="e.g. Primary mark" />
            </div>
            <div className="field">
              <label>Type</label>
              <select value={pendingVariant} onChange={(e) => setPendingVariant(e.target.value as LibraryLogo["variant"])} title={VARIANT_HINT[pendingVariant]}>
                {(Object.keys(VARIANT_LABEL) as LibraryLogo["variant"][]).map((v) => (
                  <option key={v} value={v}>{VARIANT_LABEL[v]}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <button
                type="button"
                className="button primary"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <ImagePlus size={15} strokeWidth={1.75} />
                {uploading ? "Uploading…" : "Upload logo"}
              </button>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleFile} hidden />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
