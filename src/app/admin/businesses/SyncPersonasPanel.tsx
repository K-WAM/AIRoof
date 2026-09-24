"use client";

import { useState } from "react";
import { PhoneCall } from "lucide-react";

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
        <div className="button-row">
          <button type="button" className="button" disabled={busy} onClick={() => void call(true)}>
            {busy && !preview ? "Working…" : "Preview changes"}
          </button>
          {preview && preview.targets.length > 0 && (
            <button type="button" className="button primary" disabled={busy} onClick={apply}>
              {busy ? "Syncing…" : `Apply to ${preview.targets.length} assistant${preview.targets.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
        {error && <p role="alert" style={{ color: "var(--danger, #b91c1c)", fontSize: 13, marginTop: 12 }}>{error}</p>}

        {preview && (
          <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
            {preview.targets.map((t) => (
              <div key={t.businessId} style={{ fontSize: 13 }}>
                <strong>{t.businessName}</strong>
                <span style={{ color: "var(--text-muted)" }}> — will say: “{t.greetingPreview}”{t.disclosureEnabled ? "" : " (recording notice off)"}</span>
              </div>
            ))}
            {preview.targets.length === 0 && <p style={{ fontSize: 13 }}>Nothing to sync.</p>}
            {preview.skipped.length > 0 && (
              <details style={{ fontSize: 13 }}>
                <summary>{preview.skipped.length} skipped</summary>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {preview.skipped.map((s) => <li key={s.businessId}><strong>{s.businessName}</strong> — {s.reason}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        {outcome && (
          <div style={{ marginTop: 16, fontSize: 13 }}>
            <p style={{ margin: 0 }}><strong>{outcome.synced} synced</strong>{outcome.failed > 0 ? `, ${outcome.failed} failed` : ""}.</p>
            {outcome.results.filter((r) => !r.ok).map((r) => (
              <p key={r.businessId} style={{ margin: "4px 0 0", color: "var(--danger, #b91c1c)" }}>{r.businessId}: {r.error}</p>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
