"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, PhoneCall } from "lucide-react";

interface PlanTarget { businessId: string; businessName: string; greetingPreview: string; disclosureEnabled: boolean }
interface PlanSkip { businessId: string; businessName: string; reason: string }
interface Preview { targets: PlanTarget[]; skipped: PlanSkip[] }
interface Outcome { synced: number; failed: number; results: Array<{ businessId: string; ok: boolean; error?: string }> }

/**
 * Superadmin-only. Pushes each tenant's current greeting + prompt to its live Vapi assistant
 * (needed for tenant-wide defaults such as the T-102 recording notice to reach lines nobody has
 * re-saved). Always previews first; nothing is written until the second, confirmed click.
 */
export function SyncPersonasPanel() {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [appliedNames, setAppliedNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function call(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sync-personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      if (dryRun) { setPreview(json as Preview); setOutcome(null); }
      else { setOutcome(json as Outcome); setPreview(null); }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!preview) return;
    const n = preview.targets.length;
    if (!confirm(`Update the live phone greeting and prompt on ${n} Vapi assistant${n === 1 ? "" : "s"}? Callers will hear the change on their next call.`)) return;
    // Keep the names for the result list below (the outcome only carries ids).
    setAppliedNames(Object.fromEntries(preview.targets.map((t) => [t.businessId, t.businessName])));
    void call(false);
  }

  return (
    <section className="panel" aria-labelledby="sync-title" style={{ marginBottom: 24 }}>
      <div className="panel-header">
        <h2 className="panel-title" id="sync-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <PhoneCall size={16} strokeWidth={1.75} />
          Sync live phone assistants
        </h2>
      </div>
      <div className="panel-body">
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>
          Pushes each client&apos;s current greeting (including the call-recording notice) and prompt to its live Vapi assistant.
          Preview first — nothing changes until you apply.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="button" disabled={busy} onClick={() => void call(true)}>
            {busy && !preview ? "Working…" : "Preview changes"}
          </button>
          {preview && preview.targets.length > 0 && (
            <button type="button" className="button primary" disabled={busy} onClick={apply}>
              {busy ? "Syncing…" : `Apply to ${preview.targets.length} assistant${preview.targets.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
        {error && <p role="alert" style={{ color: "var(--c-danger-fg)", fontSize: 13, margin: "12px 0 0" }}>{error}</p>}

        {preview && preview.targets.length > 0 && (
          <ul className="sync-list" aria-label="Assistants that will be updated">
            {preview.targets.map((t) => (
              <li key={t.businessId} className="sync-list-item">
                <span className="sync-list-item-name">{t.businessName}</span>
                <span className="sync-list-item-detail">Will say: “{t.greetingPreview}”</span>
                {!t.disclosureEnabled && <span className="chip warn">Recording notice off</span>}
              </li>
            ))}
          </ul>
        )}
        {preview && preview.targets.length === 0 && (
          <p style={{ fontSize: 13, margin: "12px 0 0" }}>Nothing to sync.</p>
        )}
        {preview && preview.skipped.length > 0 && (
          <details style={{ fontSize: 13, marginTop: 12 }}>
            <summary>{preview.skipped.length} skipped</summary>
            <ul className="sync-list">
              {preview.skipped.map((s) => (
                <li key={s.businessId} className="sync-list-item">
                  <span className="sync-list-item-name">{s.businessName}</span>
                  <span className="sync-list-item-detail">{s.reason}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {outcome && (
          <div style={{ marginTop: 16, fontSize: 13 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>
              {outcome.synced} synced{outcome.failed > 0 ? `, ${outcome.failed} failed` : ""}.
            </p>
            {outcome.results.length > 0 && (
              <ul className="sync-list" aria-label="Sync results">
                {outcome.results.map((r) => (
                  <li key={r.businessId} className="sync-list-item">
                    <span className="sync-list-item-name" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      {r.ok
                        ? <CheckCircle2 size={14} strokeWidth={2} color="var(--success)" aria-hidden />
                        : <AlertTriangle size={14} strokeWidth={2} color="var(--danger)" aria-hidden />}
                      {appliedNames[r.businessId] ?? r.businessId}
                    </span>
                    <span className={`sync-list-item-detail${r.ok ? "" : " is-error"}`}>
                      {r.ok ? "Updated" : r.error}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
