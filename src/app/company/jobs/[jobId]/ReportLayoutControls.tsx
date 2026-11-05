"use client";
import { useEffect, useState } from "react";
import type { ReportLetterOptions } from "@/types/documentTemplate";

export function ReportLayoutControls({ jobId, address, value, readOnly, onSaved }: { jobId: string; address?: string; value?: ReportLetterOptions; readOnly: boolean; onSaved: (value: ReportLetterOptions) => void }) {
  const [settings, setSettings] = useState<ReportLetterOptions>(value ?? {});
  const [message, setMessage] = useState("");
  useEffect(() => { setSettings(value ?? {}); }, [value]);
  async function save(next: ReportLetterOptions) {
    if (readOnly) return;
    setMessage("Saving…");
    try {
      const r = await fetch(`/api/jobs/${jobId}/report/settings`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not save report settings");
      onSaved(d.reportDocument); setMessage("Saved");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save report settings"); }
  }
  return <div className="no-print" style={{ display: "grid", gap: 10 }}>
    <label>Layout<select aria-label="Report layout" value={settings.layout ?? "report"} disabled={readOnly} onChange={e => { const next = { ...settings, layout: e.target.value as ReportLetterOptions["layout"], locations: settings.locations ?? address ?? "" }; setSettings(next); void save(next); }}><option value="report">Report</option><option value="inspection_completion">Inspection completion notice</option><option value="repair_completion">Repair completion notice</option></select></label>
    {settings.layout && settings.layout !== "report" && <><p>Completion notices include photos and never include prices.</p><label>Locations (one per line)<textarea aria-label="Completion locations" rows={3} value={settings.locations ?? address ?? ""} disabled={readOnly} onChange={e => setSettings(s => ({ ...s, locations: e.target.value }))} onBlur={() => void save(settings)} /></label>{settings.layout === "repair_completion" && <label><input type="checkbox" checked={settings.noCharge === true} disabled={readOnly} onChange={e => { const next = { ...settings, noCharge: e.target.checked }; setSettings(next); void save(next); }} /> There is no charge</label>}</>}
    {message && <small role="status">{message}</small>}
  </div>;
}
