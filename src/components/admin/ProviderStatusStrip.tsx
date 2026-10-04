"use client";

// The "how much is left" strip for each paid service (GET /api/admin/ai-status). Green = fine, red = top up now;
// "Top up" opens the provider's own billing page. Used on the Playbook's AI tab and the Usage page.

import { useEffect, useState } from "react";
import type { ProviderStatus } from "@/app/api/admin/ai-status/route";

const TONE: Record<ProviderStatus["state"], { label: string; cls: string }> = {
  ok: { label: "OK", cls: "status-pill--ok" },
  low: { label: "Low", cls: "status-pill--warn" },
  empty: { label: "Empty", cls: "status-pill--off" },
  not_set: { label: "Not set", cls: "status-pill--neutral" },
  unknown: { label: "Check", cls: "status-pill--neutral" },
};

export function ProviderStatusStrip() {
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/api/admin/ai-status").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setProviders(d.providers ?? [])).catch(() => setFailed(true));
  }, []);
  if (failed) return <p className="pb-note">Balances couldn&apos;t be loaded. Try again in a minute.</p>;
  if (!providers) return <p className="pb-note">Checking balances…</p>;
  return (
    <ul className="provider-strip" data-testid="provider-strip">
      {providers.map((p) => (
        <li key={p.id} data-state={p.state}>
          <div className="provider-strip__top">
            <strong>{p.name}</strong>
            <span className={`status-pill ${TONE[p.state].cls}`}>{TONE[p.state].label}</span>
          </div>
          <span className="provider-strip__use">{p.usedFor}</span>
          <span className="provider-strip__detail">{p.detail}</span>
          <a href={p.topUpUrl} target="_blank" rel="noreferrer" className="provider-strip__link">Top up ↗</a>
        </li>
      ))}
    </ul>
  );
}
