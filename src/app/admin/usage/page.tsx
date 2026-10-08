"use client";

// Usage & costs (owner, 2026-10-04): per client, this month or last — who's on the team, how much they call and
// talk to the field app, and what that costs us (estimate). Balances for each paid service sit on top so nothing
// runs dry. Most expensive client first. Rates: src/lib/billing/aiCostRates.ts.

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PageError } from "@/components/ui/PageError";
import { ProviderStatusStrip } from "@/components/admin/ProviderStatusStrip";
import { monthKey } from "@/lib/usage/month";
import { BarChart3 } from "lucide-react";
import { fmtMoney } from "@/lib/format/money";

interface BizUsage {
  businessId: string;
  businessName: string;
  active: boolean;
  subscriptionStatus?: "active" | "paused";
  vapiAssistantId: string | null;
  voiceProvider?: "vapi" | "elevenlabs";
  elevenLabsAgentId?: string | null;
  isDemo?: boolean;
  usage: { users: number; calls: number; callsCapped?: boolean; phoneMinutes: number; voiceNotes: number; voiceNoteMinutes: number; typedNotes: number };
  cost: { phone: number; ai: number; total: number };
  bookingCheck?: { ok: boolean; checkedAt: number; problems: string[] } | null;
}

const usd = (n: number) => fmtMoney(n);
const lastMonth = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return monthKey(d.getTime()); };

export default function AdminUsagePage() {
  const [month, setMonth] = useState(monthKey());
  const [rows, setRows] = useState<BizUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  function load(m = month) {
    setLoading(true);
    fetch(`/api/admin/usage?month=${m}`)
      .then((r) => { if (!r.ok) throw new Error("Usage request failed"); return r.json(); })
      .then((d) => { setRows(d.businesses ?? []); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(month); }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = rows.reduce((a, r) => ({
    cost: a.cost + r.cost.total, minutes: a.minutes + r.usage.phoneMinutes, notes: a.notes + r.usage.voiceNotes + r.usage.typedNotes, users: a.users + r.usage.users,
  }), { cost: 0, minutes: 0, notes: 0, users: 0 });

  const months: Array<[string, string]> = [[monthKey(), "This month"], [lastMonth(), "Last month"]];

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            <BarChart3 size={20} strokeWidth={1.75} /> Usage &amp; costs
          </h1>
          <p className="page-subtitle">What each client uses and what it costs us (estimate).</p>
        </div>
        <div className="segmented-control" aria-label="Month">
          {months.map(([key, label]) => <button key={key} type="button" className="segment" aria-pressed={month === key} onClick={() => setMonth(key)}>{label}</button>)}
        </div>
      </header>

      <section className="panel" style={{ marginBottom: "var(--sp-4)" }}>
        <div className="panel-header"><h2 className="panel-title">Balances</h2><Link href="/hub/guide" className="pb-note">How to keep them charged →</Link></div>
        <div className="panel-body"><ProviderStatusStrip /></div>
      </section>

      {loading ? <PageSkeleton metrics={4} rows={5} /> : loadError ? (
        <PageError message="Usage couldn't be loaded, so no totals are shown." onRetry={() => load()} />
      ) : (
        <>
          <section className="metric-grid" aria-label="Totals" style={{ marginBottom: "var(--sp-4)" }}>
            <article className="metric"><p className="metric-label">Estimated cost</p><p className="metric-value">{usd(totals.cost)}</p></article>
            <article className="metric"><p className="metric-label">Phone minutes</p><p className="metric-value">{totals.minutes}</p></article>
            <article className="metric"><p className="metric-label">Field notes</p><p className="metric-value">{totals.notes}</p></article>
            <article className="metric"><p className="metric-label">Users</p><p className="metric-value">{totals.users}</p></article>
          </section>

          <section className="panel">
            <div className="panel-header"><h2 className="panel-title">By client</h2></div>
            <div className="panel-body" style={{ padding: 0 }}>
              {rows.length === 0 ? <p style={{ padding: "var(--sp-5)", color: "var(--text-muted)" }}>No clients yet.</p> : (
                <table className="business-table" data-responsive data-testid="usage-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th style={{ textAlign: "right" }}>Users</th>
                      <th style={{ textAlign: "right" }}>Calls</th>
                      <th style={{ textAlign: "right" }}>Phone min</th>
                      <th style={{ textAlign: "right" }}>Field notes</th>
                      <th style={{ textAlign: "right" }}>Est. cost</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const line = r.voiceProvider === "elevenlabs" ? !!r.elevenLabsAgentId : !!r.vapiAssistantId;
                      return (
                        <tr key={r.businessId}>
                          <td>
                            <Link href={`/admin/businesses/${r.businessId}/config`} className="business-name">{r.businessName}</Link>
                            <p className="cell-note c1-phone-only">{r.usage.calls} calls · {r.usage.phoneMinutes} min · {r.usage.voiceNotes + r.usage.typedNotes} notes · {usd(r.cost.total)}</p>
                          </td>
                          <td className="hide-phone" data-label="Users" style={{ textAlign: "right" }}>{r.usage.users}</td>
                          <td className="hide-phone" data-label="Calls" style={{ textAlign: "right" }}>{r.usage.calls}{r.usage.callsCapped ? "+" : ""}</td>
                          <td className="hide-phone" data-label="Phone min" style={{ textAlign: "right" }}>{r.usage.phoneMinutes}</td>
                          <td className="hide-phone" data-label="Field notes" style={{ textAlign: "right" }} title={`${r.usage.voiceNotes} voice (${r.usage.voiceNoteMinutes} min), ${r.usage.typedNotes} typed`}>{r.usage.voiceNotes + r.usage.typedNotes}</td>
                          <td className="hide-phone" data-label="Est. cost" style={{ textAlign: "right", fontWeight: 700 }} title={`Phone ${usd(r.cost.phone)} · AI ${usd(r.cost.ai)}`}>{usd(r.cost.total)}</td>
                          <td data-label="Status">
                            {r.subscriptionStatus === "paused" ? <span className="tag urgent">Paused</span>
                              : r.isDemo ? <span className="tag">Demo</span>
                              : !line ? <Link href={`/admin/businesses/${r.businessId}/config`} className="tag urgent" style={{ textDecoration: "none" }}>No phone line</Link>
                              : r.bookingCheck && !r.bookingCheck.ok ? <span className="tag urgent" title={r.bookingCheck.problems.join("; ")}>Booking check failed</span>
                              : <span className="tag success">Live</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
          <p className="pb-note" style={{ marginTop: 8 }}>Estimates from list prices; field notes counted from Oct 4, 2026. Hover a cost for the phone/AI split.</p>
        </>
      )}
    </>
  );
}
