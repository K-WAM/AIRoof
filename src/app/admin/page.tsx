"use client";

// Overview — the superadmin's first screen (owner, 2026-10-31: "a superadmin dashboard where I can see clients,
// number of users, usage, monthly pricing and invoices, and mark them paid"). Money on top, then "Needs you", then
// the balances, then one row per client. Everything is computed by src/lib/admin/overview.ts (GET /api/admin/overview);
// Mark paid / Send stay on the Invoices page — every invoice link here opens that exact invoice.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, LayoutDashboard } from "lucide-react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PageError } from "@/components/ui/PageError";
import { ProviderStatusStrip } from "@/components/admin/ProviderStatusStrip";
import { fmtMoney } from "@/lib/format/money";
import { invoiceHref, newInvoiceHref, sinceLabel, type BillingState, type OverviewSummary } from "@/lib/admin/overview";

type OverviewResponse = OverviewSummary & { signInsKnown: boolean; invoicesCapped: boolean };

const usd = (n: number) => fmtMoney(n);
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
};
const shortDate = (ymd: string) => {
  const t = Date.parse(`${ymd}T12:00:00Z`);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : ymd;
};

function BillingTag({ billing, businessId }: { billing: BillingState; businessId: string }) {
  switch (billing.kind) {
    case "overdue":
      return <Link href={invoiceHref(billing.invoiceId)} className="tag urgent" style={{ textDecoration: "none" }}>Overdue {billing.days}d · {usd(billing.amount)}</Link>;
    case "due":
      return <Link href={invoiceHref(billing.invoiceId)} className="tag" style={{ textDecoration: "none" }}>Due {shortDate(billing.dueDate)} · {usd(billing.amount)}</Link>;
    case "draft":
      return <Link href={invoiceHref(billing.invoiceId)} className="tag" style={{ textDecoration: "none" }}>Draft to send</Link>;
    case "paid":
      return <Link href={invoiceHref(billing.invoiceId)} className="tag success" style={{ textDecoration: "none" }}>Paid</Link>;
    default:
      return <Link href={newInvoiceHref(businessId)} className="pb-note">New invoice</Link>;
  }
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/overview")
      .then((r) => { if (!r.ok) throw new Error("Overview request failed"); return r.json(); })
      .then((d: OverviewResponse) => { setData(d); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const m = data?.metrics;
  const month = data ? monthLabel(data.month) : "";

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            <LayoutDashboard size={20} strokeWidth={1.75} /> Overview
          </h1>
          <p className="page-subtitle">Your clients, what they pay, what they cost us, and anything that needs you.</p>
        </div>
        <Link href="/admin/invoices" className="button secondary">Invoices</Link>
      </header>

      {loading && !data ? <PageSkeleton metrics={4} rows={5} /> : loadError || !data || !m ? (
        <PageError message="The overview couldn't be loaded." onRetry={load} />
      ) : (
        <>
          <section className="metric-grid" aria-label="Money">
            <article className="metric" data-testid="metric-revenue">
              <p className="metric-label">Monthly revenue</p>
              <p className="metric-value">{usd(m.monthlyRevenue)}</p>
              <p className="pb-note">{m.payingClients} paying client{m.payingClients === 1 ? "" : "s"}{m.pausedClients ? ` · ${m.pausedClients} paused` : ""}</p>
            </article>
            <article className="metric">
              <p className="metric-label">Collected in {month}</p>
              <p className="metric-value">{usd(m.collectedThisMonth)}</p>
              <p className="pb-note">Invoices marked paid</p>
            </article>
            <article className="metric">
              <p className="metric-label">Unpaid</p>
              <p className="metric-value" style={m.overdue > 0 ? { color: "var(--danger)" } : undefined}>{usd(m.unpaid)}</p>
              <p className="pb-note">{m.overdueCount ? `${usd(m.overdue)} overdue (${m.overdueCount})` : "Nothing overdue"}</p>
            </article>
            <article className="metric">
              <p className="metric-label">Our cost in {month}</p>
              <p className="metric-value">{usd(m.costThisMonth)}</p>
              <p className="pb-note">Margin {usd(m.margin)} (estimate)</p>
            </article>
          </section>

          <section className="panel" style={{ marginBottom: "var(--sp-4)" }} aria-label="Needs you">
            <div className="panel-header"><h2 className="panel-title">Needs you</h2></div>
            <div className="panel-body">
              {data.attention.length === 0 ? (
                <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)" }}>
                  <CheckCircle2 size={16} strokeWidth={1.75} /> Nothing needs you right now.
                </p>
              ) : (
                <ul data-testid="attention-list" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                  {data.attention.map((item, i) => (
                    <li key={`${item.href}-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <AlertTriangle size={16} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 2, color: item.tone === "urgent" ? "var(--danger)" : "var(--text-muted)" }} />
                      <Link href={item.href}>{item.text}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="panel" style={{ marginBottom: "var(--sp-4)" }}>
            <div className="panel-header"><h2 className="panel-title">Balances</h2><Link href="/hub/guide" className="pb-note">How to keep them charged →</Link></div>
            <div className="panel-body"><ProviderStatusStrip /></div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Clients</h2>
              <span className="pb-note">{m.activeUsers} of {m.users} users signed in within 30 days</span>
            </div>
            <div className="panel-body" style={{ padding: 0 }}>
              {data.clients.length === 0 ? (
                <p style={{ padding: "var(--sp-5)", color: "var(--text-muted)" }}>
                  No clients yet. <Link href="/hub/onboarding">Add your first client</Link>
                </p>
              ) : (
                <table className="business-table" data-responsive data-testid="overview-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th style={{ textAlign: "right" }}>Plan</th>
                      <th style={{ textAlign: "right" }}>Users</th>
                      <th>Last sign-in</th>
                      <th style={{ textAlign: "right" }}>Calls</th>
                      <th style={{ textAlign: "right" }}>Our cost</th>
                      <th style={{ textAlign: "right" }}>Margin</th>
                      <th>Billing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.clients.map((c) => (
                      <tr key={c.businessId}>
                        <td>
                          <Link href={`/admin/businesses/${c.businessId}/config`} className="business-name">{c.businessName}</Link>
                          {c.paused && <> <span className="tag urgent">Paused</span></>}
                          <p className="cell-note c1-phone-only">
                            {c.monthlyAmount !== null ? `${usd(c.monthlyAmount)}/mo` : "No price"} · {c.users} user{c.users === 1 ? "" : "s"} · last sign-in {sinceLabel(c.lastSignInAt).toLowerCase()} · cost {usd(c.cost)}
                          </p>
                        </td>
                        <td className="hide-phone" data-label="Plan" style={{ textAlign: "right" }} title={c.planName ?? undefined}>
                          {c.monthlyAmount !== null ? `${usd(c.monthlyAmount)}/mo` : <Link href={`/admin/businesses/${c.businessId}/config`} className="pb-note">Set price</Link>}
                        </td>
                        <td className="hide-phone" data-label="Users" style={{ textAlign: "right" }} title={`${c.activeUsers} signed in within 30 days`}>{c.activeUsers}/{c.users}</td>
                        <td className="hide-phone" data-label="Last sign-in">{data.signInsKnown ? sinceLabel(c.lastSignInAt) : "—"}</td>
                        <td className="hide-phone" data-label="Calls" style={{ textAlign: "right" }} title={`${c.phoneMinutes} phone min · ${c.notes} field notes`}>{c.calls}</td>
                        <td className="hide-phone" data-label="Our cost" style={{ textAlign: "right" }}>{usd(c.cost)}</td>
                        <td className="hide-phone" data-label="Margin" style={{ textAlign: "right", fontWeight: 700 }}>{c.margin === null ? "—" : usd(c.margin)}</td>
                        <td data-label="Billing"><BillingTag billing={c.billing} businessId={c.businessId} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
          <p className="pb-note" style={{ marginTop: 8 }}>
            This month so far. Costs are estimates (details on <Link href="/admin/usage">Usage &amp; costs</Link>).
            {m.demoCost > 0 ? ` Demo and test accounts cost ${usd(m.demoCost)} more, not counted above.` : ""}
            {data.signInsKnown ? "" : " Sign-in times couldn't be read this time."}
            {data.invoicesCapped ? " Only the latest 500 invoices are counted." : ""}
          </p>
        </>
      )}
    </>
  );
}
