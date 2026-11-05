"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { clearCachedProfile } from "@/lib/auth/profileCache";
import { InlineNotice } from "@/components/ui/InlineNotice";

export function ViewAsBanner() {
  const { user } = useAuth();
  const viewed = user?.viewAs;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Re-verify on expiry or return from a sleeping tab, before leaving stale preview controls on screen.
  useEffect(() => {
    if (!viewed) return;
    const expire = () => {
      if (Date.now() < viewed.expiresAt) return;
      // End the server record and clear the HttpOnly cookie too, then leave for the real Admin tab.
      void fetch("/api/admin/view-as", { method: "DELETE", keepalive: true })
        .catch(() => {}).finally(() => { clearCachedProfile(); window.location.assign("/admin/businesses"); });
    };
    const timer = setTimeout(expire, Math.max(0, viewed.expiresAt - Date.now()));
    window.addEventListener("focus", expire);
    return () => { clearTimeout(timer); window.removeEventListener("focus", expire); };
  }, [viewed]);

  if (!viewed) return null;
  async function exit() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/view-as", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not exit view as. Try again.");
      clearCachedProfile();
      window.location.assign("/admin/businesses");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not exit view as."); setBusy(false); }
  }
  // One compact row on every width: the label shrinks (ellipsis, full text in the tooltip); Exit always stays visible.
  return <div data-testid="view-as-banner" role="region" aria-label="View as" style={{ padding: "var(--sp-2) var(--sp-3)", background: "var(--surface)", color: "var(--text)", borderBottom: "1px solid var(--border)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
      <span title={`Viewing as ${viewed.label} · ${viewed.businessName} — read-only`} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        Viewing as <strong>{viewed.label}</strong> · {viewed.businessName} — read-only
      </span>
      <button type="button" className="button" style={{ flexShrink: 0 }} onClick={() => void exit()} disabled={busy}>{busy ? "Exiting…" : "Exit"}</button>
    </div>
    {error && <InlineNotice message={error} />}
  </div>;
}
