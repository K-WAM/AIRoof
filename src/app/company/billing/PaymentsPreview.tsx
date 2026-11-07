"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import type { FinanceRow } from "@/types/finance";
import { useBootstrap } from "@/contexts/BootstrapContext";

export interface PaymentsPreviewInvoice {
  invoiceId: string;
  customer: string;
  total: number;
  balance: number;
  status: "sent" | "paid";
  daysLate: number;
}

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const headStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  margin: "0 0 10px",
};

export function PaymentsPreview({ invoices }: { invoices: PaymentsPreviewInvoice[] }) {
  const business = useBootstrap().data?.business;
  const showcase = business?.showcase;
  const { user } = useAuth();
  const businessId = useBusinessId();
  const preview = useSearchParams()?.get("preview");
  const { isEnabled } = useBusinessModules();
  const [opened, setOpened] = useState(false);
  const canReadFinance = showcase?.finances === true && (user?.role === "owner" || (!!user?.superadmin && !!preview));
  const sourceKey = `${businessId}:${canReadFinance}`;
  const currentKey = useRef(sourceKey); currentKey.current = sourceKey;
  const requested = useRef(new Set<string>());
  const [source, setSource] = useState<{key: string; number: string; amount: number; name: string} | null>(null);
  const hasCustomers = isEnabled("library");
  useEffect(() => {
    if (!opened || showcase?.payments !== true || !user || requested.current.has(sourceKey)) return;
    requested.current.add(sourceKey);
    async function load() {
      let invoice: FinanceRow | undefined;
      if (canReadFinance) {
        try {
          const res = await fetch(`/api/company/finance?${new URLSearchParams({businessId})}`);
          if (res.ok) {
            const data = await res.json();
            invoice = (data.rows as FinanceRow[] | undefined)?.filter(r => r.source === "jobba").sort((a,b) => b.issuedAt-a.issuedAt)[0];
          }
        } catch { /* The inert preview can still show the customer's name. */ }
      }
      let name = "Your customer";
      if (!invoice && hasCustomers) {
        try {
          const res = await fetch(`/api/company/customers?${new URLSearchParams({businessId})}`);
          if (res.ok) name = (await res.json()).customers?.[0]?.name || name;
        } catch { /* Keep the neutral customer label on a read failure. */ }
      }
      if (currentKey.current === sourceKey) setSource({key:sourceKey, number:invoice?.invoiceNo || "Preview", amount:invoice?.total ?? 0, name:invoice?.customer || name});
    }
    void load();
  }, [opened, sourceKey, businessId, canReadFinance, hasCustomers, showcase?.payments, user]);
  if (showcase?.payments !== true) return null;
  const issuer = business?.companies?.find(c => c.isDefault) ?? business?.companies?.[0];
  const issuerName = issuer?.name || business?.businessName || "Your business";
  const issuerLogo = issuer?.logoUrl || business?.logoUrl;
  const sent = invoices.filter((invoice) => invoice.status === "sent");
  const payPage = source?.key === sourceKey ? source : {number:"Preview", amount:0, name:"Your customer"};

  const paidCount = invoices.filter((invoice) => invoice.status === "paid").length;
  const partlyPaidCount = sent.filter((invoice) => invoice.balance < invoice.total).length;
  const overdueCount = sent.filter((invoice) => invoice.daysLate > 0).length;

  return (
    <section className="panel" data-testid="payments-preview" style={{ marginBottom: 16 }}>
      <div className="panel-header" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h2 className="panel-title" style={{ margin: 0 }}>Online payments</h2>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            border: "1px solid #cbd5e1",
            borderRadius: 999,
            padding: "2px 8px",
            fontSize: 11,
            fontWeight: 700,
            color: "#64748b",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Preview
        </span>
      </div>
      <details onToggle={e => { if (e.currentTarget.open) setOpened(true); }}>
        <summary
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--border)",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--accent)",
          }}
        >
          See how customers would pay online
        </summary>
        <div style={{ padding: 16, display: "grid", gap: 20 }}>
          <div>
            <h3 style={headStyle}>What your customer sees</h3>
            <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, maxWidth: 420 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {issuerLogo && <img src={issuerLogo} alt={`${issuerName} logo`} style={{height:36,width:"auto",maxWidth:160,objectFit:"contain"}} />}
                <strong>{issuerName}</strong>
              </div>
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-muted)" }}>Bill to</p>
              <p style={{ margin: "2px 0 12px", fontSize: 14, fontWeight: 600 }}>{payPage.name}</p>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, fontSize: 13, marginBottom: 12 }}>
                <span>Invoice {payPage.number}</span>
                <strong>{usd(payPage.amount)} invoice total</strong>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <button
                  type="button"
                  className="button secondary"
                  disabled
                  style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, height: "auto", padding: "9px 12px", textAlign: "left" }}
                >
                  <span style={{ fontWeight: 600 }}>Pay by bank (ACH)</span>
                  <span style={{ fontSize: 11, fontWeight: 400 }}>Online payments turn on at launch.</span>
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled
                  style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, height: "auto", padding: "9px 12px", textAlign: "left" }}
                >
                  <span style={{ fontWeight: 600 }}>Pay by card</span>
                  <span style={{ fontSize: 11, fontWeight: 400 }}>Online payments turn on at launch.</span>
                </button>
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "#94a3b8" }}>Payments by Stripe</p>
            </div>
          </div>

          <div>
            <h3 style={headStyle}>What your office sees</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 14 }}>
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 11.5, color: "#94a3b8" }}>Paid</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{paidCount}</div>
              </div>
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 11.5, color: "#94a3b8" }}>Partly paid</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{partlyPaidCount}</div>
              </div>
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 11.5, color: "#94a3b8" }}>Overdue</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{overdueCount}</div>
              </div>
            </div>
            <h4 style={{ ...headStyle, margin: "0 0 8px", textTransform: "none", letterSpacing: 0, fontSize: 13, color: "var(--text)" }}>
              Deposits to your bank <span style={{ fontWeight: 400, color: "#94a3b8", fontSize: 11.5 }}>Sample</span>
            </h4>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{display:"flex",justifyContent:"space-between",gap:10,padding:"10px",background:"var(--surface-muted)",borderRadius:8,fontSize:13}}>
                <span>Deposit: 50% of {usd(payPage.amount)}</span><strong>{usd(payPage.amount / 2)}</strong>
              </div>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
            Stripe charges a fee per payment; exact rates are confirmed at setup.
          </p>
        </div>
      </details>
    </section>
  );
}
