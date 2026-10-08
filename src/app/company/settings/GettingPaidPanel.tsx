"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Toggle } from "@/components/ui/Toggle";
import { Wallet } from "lucide-react";
import type { EffectiveBillingPrefs } from "@/lib/billing/customerPayments";

/**
 * Settings → "Getting paid" (Billing product). How customers pay this business: printed as "How to pay" on every
 * invoice and reminder, with a Pay button when there's a pay link (their own Square/PayPal/QuickBooks page — no Stripe,
 * no money passes through Luxor). Owner edits; staff see it read-only. Own Save, like Terms & notices.
 */
export function GettingPaidPanel({ businessId }: { businessId: string }) {
  const { user } = useAuth();
  const canEdit = user?.role === "owner" || !!user?.superadmin;
  const [prefs, setPrefs] = useState<EffectiveBillingPrefs | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetch(`/api/company/settings/billing?businessId=${encodeURIComponent(businessId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { prefs: EffectiveBillingPrefs }) => { if (live) setPrefs(data.prefs); })
      .catch(() => { if (live) setError("Payment settings couldn't be loaded."); });
    return () => { live = false; };
  }, [businessId]);

  function change(patch: Partial<EffectiveBillingPrefs>) {
    setPrefs((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
    setMessage("");
  }

  async function save() {
    if (!prefs) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/company/settings/billing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, ...prefs }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save.");
      setPrefs(data.prefs);
      setDirty(false);
      setMessage("Saved. New invoices and reminders use this.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="getting-paid" className="panel" data-testid="getting-paid">
      <div className="panel-header"><h2 className="panel-title"><Wallet size={16} strokeWidth={1.75} /> Getting paid</h2></div>
      <div className="panel-body">
        <p>Printed on every invoice as &ldquo;How to pay&rdquo;. Customers pay you directly — nothing goes through us.</p>
        {!prefs ? <p>{error || "Loading…"}</p> : (
          <>
            <div className="field">
              <label htmlFor="payInstructions">How customers pay you</label>
              <textarea id="payInstructions" rows={3} maxLength={600} disabled={!canEdit} value={prefs.payInstructions}
                placeholder={"Zelle: pay@yourcompany.com\nChecks payable to Your Company, 123 Main St"}
                onChange={(e) => change({ payInstructions: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="payLink">Pay link (optional)</label>
              <input id="payLink" type="url" inputMode="url" maxLength={500} disabled={!canEdit} value={prefs.payLink}
                placeholder="https://square.link/u/…" onChange={(e) => change({ payLink: e.target.value.trim() })} />
              <p>Your own Square, PayPal or QuickBooks pay page. Adds a Pay button to the invoice email.</p>
            </div>
            <div className="field">
              <label htmlFor="dueDays">Payment due</label>
              <select id="dueDays" disabled={!canEdit} value={prefs.dueDays} onChange={(e) => change({ dueDays: Number(e.target.value) })}>
                {[0, 7, 15, 30, 45, 60].map((d) => <option key={d} value={d}>{d === 0 ? "On receipt" : `${d} days after the invoice`}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 12px" }}>
              <Toggle checked={prefs.remindersOn} disabled={!canEdit} onChange={(next) => change({ remindersOn: next })} label="Email overdue reminders" />
              <span>Email the customer a reminder 1, 7 and 14 days after the due date</span>
            </div>
            {canEdit && <button type="button" className="button primary" disabled={!dirty || busy} onClick={save}>{busy ? "Saving…" : "Save payment details"}</button>}
            {!canEdit && <p className="settings-note">Only the account owner can change where customers pay.</p>}
            {message && <p role="status" style={{ marginTop: 8, color: "#15803d" }}>{message}</p>}
            {error && prefs && <p role="alert" style={{ marginTop: 8, color: "#b91c1c" }}>{error}</p>}
          </>
        )}
      </div>
    </section>
  );
}
