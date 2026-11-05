"use client";

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

const SAMPLE_DEPOSITS = [
  { date: "Oct 3", label: "Acme Property Group", amount: 4800 },
  { date: "Oct 17", label: "12 Palm Court", amount: 2150 },
  { date: "Oct 31", label: "Northside Plaza", amount: 3600 },
];

const headStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  margin: "0 0 10px",
};

export function PaymentsPreview({ invoices }: { invoices: PaymentsPreviewInvoice[] }) {
  const showcase = (useBootstrap().data?.business as { showcase?: { payments?: boolean } } | undefined)?.showcase;
  if (showcase?.payments !== true) return null;

  const sent = invoices.filter((invoice) => invoice.status === "sent");
  const firstSent = sent[0];
  const payPage = firstSent
    ? { number: firstSent.invoiceId, amount: firstSent.balance, name: firstSent.customer }
    : { number: "INV-1042", amount: 1450, name: "Acme Property Group" };

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
      <details>
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
              <p style={{ margin: 0, fontSize: 11.5, color: "#94a3b8" }}>Bill to</p>
              <p style={{ margin: "2px 0 12px", fontSize: 14, fontWeight: 600 }}>{payPage.name}</p>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, fontSize: 13, marginBottom: 12 }}>
                <span>Invoice {payPage.number}</span>
                <strong>{usd(payPage.amount)} due</strong>
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
              {SAMPLE_DEPOSITS.map((deposit) => (
                <div
                  key={`${deposit.date}-${deposit.label}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "7px 10px", background: "#f8fafc", borderRadius: 8, fontSize: 12.5 }}
                >
                  <span>Sample · {deposit.date} · {deposit.label}</span>
                  <strong style={{ whiteSpace: "nowrap" }}>{usd(deposit.amount)}</strong>
                </div>
              ))}
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
