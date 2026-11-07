"use client";

// Billing (Billing product, no Stripe): one screen for the money. What customers owe, what's late, what came in this
// month — and the invoices behind each number, oldest-late first. Tapping a row opens the job's Invoice tab, where
// "Record payment" lives. One request (GET /api/company/billing); nothing here polls.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useFormat } from "@/hooks/useFormat";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PageError } from "@/components/ui/PageError";
import { EmptyState } from "@/components/ui/EmptyState";
import { Wallet } from "lucide-react";
import type { BillingRow } from "@/app/api/company/billing/route";
import type { BootstrapCompany } from "@/types/company";
import { CompanyFilter } from "@/components/companies/CompanyFilter";
import { CompanyBadge } from "@/components/companies/CompanyBadge";
import { ExampleTag } from "@/components/ui/ExampleTag";
import { UnmatchedPayments } from "./UnmatchedPayments";
import { PaymentsPreview } from "./PaymentsPreview";
import { useAuth } from "@/contexts/AuthContext";
import { useBootstrap } from "@/contexts/BootstrapContext";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import { moneyNavLinks } from "../navModel";

interface BillingView {
  totals: { owed: number; overdue: number; paidThisMonth: number; unpaidCount: number; overdueCount: number };
  unpaid: BillingRow[];
  paid: BillingRow[];
  capped: boolean;
  companies?: BootstrapCompany[];
}

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const PAGE = 30;

function DepositChip({ kind }: { kind?: string }) {
  if (kind !== "deposit") return null;
  return <span className="chip" style={{ marginLeft: 6, fontSize: 11, verticalAlign: "middle" }}>Deposit</span>;
}

export default function BillingPage() {
  const businessId = useBusinessId();
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");
  const fmt = useFormat();
  const [view, setView] = useState<BillingView | null>(null);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [companyFilter, setCompanyFilter] = useState("all");
  const { user } = useAuth();
  const { isEnabled } = useBusinessModules();
  const showcase = useBootstrap().data?.business.showcase;
  // Imported history (Jobba invoices) lives on the Finances overview, never on this list. Point there instead of a dead end.
  const financesHref = moneyNavLinks({ role: user?.role, superadmin: user?.superadmin, preview: !!preview, isEnabled, showcase })
    .some((l) => l.path === "/company/finances") ? `/company/finances${preview ? `?preview=${preview}` : ""}` : null;

  const load = useCallback(() => {
    if (!businessId) return;
    setFailed(false);
    const company = companyFilter === "all" ? "" : `&company=${encodeURIComponent(companyFilter)}`;
    fetch(`/api/company/billing?businessId=${encodeURIComponent(businessId)}${company}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: BillingView) => setView(d))
      .catch(() => setFailed(true));
  }, [businessId, companyFilter]);
  useEffect(() => { load(); }, [load]);

  const jobHref = (jobId: string) => `/company/jobs/${jobId}?tab=invoice${preview ? `&preview=${preview}` : ""}`;

  if (failed) return <PageError message="Billing couldn't be loaded, so no totals are shown." onRetry={load} />;
  if (!view) return <PageSkeleton metrics={3} rows={5} />;

  const { totals, unpaid, paid } = view;
  const nothingYet = unpaid.length === 0 && paid.length === 0;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Wallet size={20} strokeWidth={1.75} /> Invoices
          </h1>
          <p className="page-subtitle">
            {totals.overdueCount > 0
              ? `${totals.overdueCount} invoice${totals.overdueCount === 1 ? " is" : "s are"} past due — start there.`
              : totals.unpaidCount > 0 ? `${totals.unpaidCount} invoice${totals.unpaidCount === 1 ? "" : "s"} waiting on payment.` : "Nobody owes you anything right now."}
          </p>
        </div>
      </header>

      {view.companies && <div style={{ marginBottom: 16 }}><CompanyFilter companies={view.companies} value={companyFilter} onChange={(next) => { setShown(PAGE); setCompanyFilter(next); }} /></div>}

      <UnmatchedPayments key={businessId} businessId={businessId} />

      <PaymentsPreview invoices={[...unpaid, ...paid]} />

      <section className="metric-grid" aria-label="Money summary" data-testid="billing-totals">
        <article className="metric"><p className="metric-label">Owed to you</p><p className="metric-value">{usd(totals.owed)}</p></article>
        <article className="metric"><p className="metric-label">Past due</p><p className="metric-value" style={totals.overdue > 0 ? { color: "#b91c1c" } : undefined}>{usd(totals.overdue)}</p></article>
        <article className="metric"><p className="metric-label">Paid this month</p><p className="metric-value">{usd(totals.paidThisMonth)}</p></article>
      </section>

      {nothingYet ? (
        <EmptyState icon={Wallet} title="No invoices sent yet"
          body="Send an invoice from a finished job. It shows up here until the customer pays, and you record the payment on the job."
          action={{ label: "Go to jobs", href: `/company/jobs${preview ? `?preview=${preview}` : ""}` }}
          secondary={financesHref ? { label: "See past invoices in Finances", href: financesHref } : undefined} testId="billing-empty" />
      ) : (
        <>
          <div className="feed-section" data-testid="billing-unpaid">
            <div className="feed-section-header"><p className="feed-section-title">Waiting on payment</p><span className="feed-section-count">{unpaid.length}</span></div>
            {unpaid.length === 0 && <div className="feed-empty">All sent invoices are paid.</div>}
            {unpaid.slice(0, shown).map((row) => (
              <Link key={row.invoiceId} href={jobHref(row.jobId)} className="feed-row">
                <div className="feed-body">
                  <p className="feed-name">{row.customer} · {row.invoiceId}<DepositChip kind={row.kind} />{view.companies && <> <CompanyBadge companies={view.companies} companyId={row.companyId} /></>}{row.sample && <ExampleTag />}</p>
                  <p className="feed-sub">
                    {row.daysLate > 0 ? <strong style={{ color: "#b91c1c" }}>{row.daysLate} day{row.daysLate === 1 ? "" : "s"} late</strong> : row.dueAt ? `Due ${fmt.fmtDay(row.dueAt)}` : "Due on receipt"}
                    {row.balance < row.total ? ` · ${usd(row.total - row.balance)} paid so far` : ""}
                  </p>
                </div>
                <strong style={{ whiteSpace: "nowrap" }}>{usd(row.balance)}</strong>
                <span className="feed-chevron">›</span>
              </Link>
            ))}
            {unpaid.length > shown && <button type="button" className="button ghost small" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, unpaid.length - shown)} more</button>}
          </div>

          {paid.length > 0 && (
            <div className="feed-section" data-testid="billing-paid">
              <div className="feed-section-header"><p className="feed-section-title">Recently paid</p><span className="feed-section-count">{paid.length}</span></div>
              {paid.map((row) => (
                <Link key={row.invoiceId} href={jobHref(row.jobId)} className="feed-row">
                  <div className="feed-body">
                    <p className="feed-name">{row.customer} · {row.invoiceId}<DepositChip kind={row.kind} />{view.companies && <> <CompanyBadge companies={view.companies} companyId={row.companyId} /></>}{row.sample && <ExampleTag />}</p>
                    <p className="feed-sub">Paid{row.paidAt ? ` ${fmt.fmtDay(row.paidAt)}` : ""}</p>
                  </div>
                  <strong style={{ whiteSpace: "nowrap" }}>{usd(row.total)}</strong>
                  <span className="feed-chevron">›</span>
                </Link>
              ))}
            </div>
          )}
          {view.capped && <p className="pb-note">Showing the newest {unpaid.length + paid.length} invoices.</p>}
        </>
      )}
    </>
  );
}
