"use client";
import type { LibraryLogo } from "@/types/library";

export function LogoPicker({ logos, value, disabled, onChange }: { logos: LibraryLogo[]; value?: string | null; disabled: boolean; onChange: (id: string | null) => void }) {
  return <label style={{ display: "grid", gap: 4 }}>Letterhead<select aria-label="Letterhead logo" disabled={disabled} value={value ?? ""} onChange={e => onChange(e.target.value || null)} style={{ maxWidth: "100%" }}><option value="">Business default logo</option>{logos.map(logo => <option key={logo.logoId} value={logo.logoId}>{logo.name}</option>)}</select></label>;
}
