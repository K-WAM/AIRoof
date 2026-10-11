"use client";

import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";

/**
 * "How clients pay you" — the Zelle address printed on every Luxor invoice and overdue reminder (owner, 2026-10-10:
 * "LUXOR_ZELLE_TO should be set in the app as a form"). Saved to platform/billing via /api/admin/billing-settings.
 * Blank = no Zelle line.
 */
export function PayOptionsPanel() {
  const [zelleTo, setZelleTo] = useState("");
  const [saved, setSaved] = useState("");
  const [fromEnv, setFromEnv] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/admin/billing-settings")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { zelleTo: string; fromEnv: boolean }) => { if (live) { setZelleTo(d.zelleTo); setSaved(d.zelleTo); setFromEnv(d.fromEnv); } })
      .catch(() => { if (live) setMessage({ tone: "error", text: "Could not load your payment options." }); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  async function save() {
    setBusy(true); setMessage(null);
    try {
      const r = await fetch("/api/admin/billing-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zelleTo }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not save");
      setZelleTo(d.zelleTo); setSaved(d.zelleTo); setFromEnv(false);
      setMessage({ tone: "ok", text: d.zelleTo ? "Saved. New invoices and reminders show the Zelle line." : "Saved. Invoices no longer show a Zelle line." });
    } catch (e) { setMessage({ tone: "error", text: e instanceof Error ? e.message : "Could not save" }); }
    finally { setBusy(false); }
  }

  return (
    <section className="panel no-print" data-testid="pay-options">
      <div className="panel-header">
        <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Wallet size={16} strokeWidth={1.75} />
          How clients pay you
        </h2>
      </div>
      <div className="panel-body" style={{ display: "grid", gap: 8 }}>
        <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
          Zelle (email or phone)
          <input type="text" inputMode="email" value={zelleTo} disabled={loading || busy} maxLength={120}
            onChange={(e) => { setZelleTo(e.target.value); setMessage(null); }} placeholder="billing@luxordev.com" />
        </label>
        <small style={{ color: "var(--text-muted)" }}>
          Printed on every invoice and reminder with the invoice number as the memo. Leave blank for no Zelle line.
          {fromEnv && " A Zelle address is currently set on the server; saving here replaces it."}
        </small>
        <div>
          <button className="button primary small" type="button" disabled={loading || busy || zelleTo.trim() === saved} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
        {message && <p role={message.tone === "error" ? "alert" : "status"} style={{ margin: 0, fontSize: 13, color: message.tone === "error" ? "var(--danger, #b91c1c)" : "var(--accent)" }}>{message.text}</p>}
      </div>
    </section>
  );
}
