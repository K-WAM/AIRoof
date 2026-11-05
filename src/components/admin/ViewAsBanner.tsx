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
  return <div data-testid="view-as-banner" role="region" aria-label="View as" style={{ padding: "var(--sp-3)", background: "var(--surface)", color: "var(--text)", borderBottom: "1px solid var(--border)", overflowWrap: "anywhere" }}>
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "var(--sp-2)" }}>
      <span>Viewing as {viewed.label} · {viewed.businessName} — read-only</span>
      <button type="button" className="button" onClick={() => void exit()} disabled={busy}>{busy ? "Exiting…" : "Exit"}</button>
    </div>
    {error && <InlineNotice message={error} />}
  </div>;
}
