"use client";

import { useState } from "react";
import { Toggle } from "@/components/ui/Toggle";
import type { Job } from "@/types/jobs";

/**
 * "Commercial property" — the statutory Terms & notices (lien law, recovery fund, defect notice) are homeowner
 * protections, so they print only on residential jobs. Default is residential; this saves the change on the job.
 */
export function PropertyTypeToggle({ jobId, businessId, value, onChange, disabled = false }: {
  jobId: string;
  businessId: string;
  value: Job["propertyType"];
  onChange: (next: NonNullable<Job["propertyType"]>) => void;
  disabled?: boolean;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const commercial = value === "commercial";

  async function save(nextCommercial: boolean) {
    const next = nextCommercial ? "commercial" : "residential";
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, propertyType: next }),
      });
      if (!res.ok) throw new Error("save failed");
      onChange(next);
    } catch {
      setError("Couldn't save the property type. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print" style={{ display: "grid", gap: 4 }}>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: disabled || busy ? "not-allowed" : "pointer" }}>
        <Toggle checked={commercial} onChange={save} label="Commercial property" disabled={disabled || busy} size="sm" />
        <span style={{ minWidth: 0 }}>
          <strong style={{ fontSize: 14 }}>Commercial property</strong>
          <br />
          <small style={{ color: "var(--text-muted)" }}>Homeowner-protection notices (lien, recovery fund, defects) are left off commercial jobs.</small>
        </span>
      </label>
      {error && <small role="alert" style={{ color: "var(--danger, #b91c1c)" }}>{error}</small>}
    </div>
  );
}
