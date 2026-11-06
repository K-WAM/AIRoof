"use client";

import { useEffect, useState } from "react";
import { Toggle } from "@/components/ui/Toggle";

interface Status { connected: boolean; chargesEnabled: boolean; ready: boolean; payNow: boolean; canConnect: boolean }
const endpoint = "/api/company/settings/billing/connect";

export function OnlinePayments({ canEdit }: { canEdit: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const params = new URLSearchParams(window.location.search);
    const returning = params.has("stripeReturn") || params.has("stripeRefresh");
    fetch(`${endpoint}${returning ? "?refresh=1" : ""}`)
      .then(async res => { if (!res.ok) throw new Error("Online payments could not be loaded."); return res.json(); })
      .then((data: Status) => { if (live) setStatus(data); })
      .catch((err: Error) => { if (live) setError(err.message); });
    return () => { live = false; };
  }, []);

  async function update(method: "POST" | "PUT", payNow?: boolean) {
    setBusy(true); setError("");
    try {
      const res = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payNow }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Please try again.");
      if (method === "POST") window.location.assign(data.url);
      else setStatus(data);
    } catch (err) { setError(err instanceof Error ? err.message : "Please try again."); }
    finally { setBusy(false); }
  }

  return <section aria-labelledby="online-payments-title" style={{ marginBottom: 24 }}>
    <h3 id="online-payments-title">Online payments</h3>
    {/* Until online payments exist for this workspace the controls can't do anything: one status line instead of two
        disabled controls (no dead ends; also keeps Settings within its phone length budget, T-327). */}
    <p role="status"><span>{status ? status.ready ? "Stripe connected - ready for payments" : status.connected ? "Finish setting up Stripe" : "Not connected" : error ? "Status unavailable" : "Loading..."}</span>{status && !status.canConnect && " · Online payments are not available for this workspace yet."}</p>
    {status && !status.canConnect ? null : <>
    {canEdit && status && !status.ready && <button type="button" className="button primary" disabled={busy || !status.canConnect} onClick={() => update("POST")}>{busy ? "Opening..." : status.connected ? "Finish Stripe setup" : "Connect Stripe"}</button>}
    {status && canEdit && <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
      <Toggle checked={status.payNow} disabled={!canEdit || !status.ready || busy} onChange={value => update("PUT", value)} label="Show a Pay now button on invoices" />
      <span>Show a Pay now button on invoices</span>
    </div>}
    {status && !canEdit && <p>Invoice Pay now is {status.payNow ? "on" : "off"}.</p>}
    {!canEdit && <p>Only the account owner can change online payments.</p>}
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
