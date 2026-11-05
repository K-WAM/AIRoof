"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface UnmatchedView { count: number; payments: { eventId: string; eventType: string; amount: number; currency: string; sessionId?: string; paymentIntentId?: string; chargeId?: string }[] }
export function UnmatchedPayments({ businessId }: { businessId: string | null }) {
  const { user } = useAuth();
  const allowed = !user?.superadmin && (user?.role === "owner" || user?.role === "staff");
  const [view, setView] = useState<UnmatchedView | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!allowed || !businessId) return;
    let live = true;
    fetch(`/api/company/billing/unmatched?businessId=${encodeURIComponent(businessId)}`)
      .then(async res => { if (!res.ok) throw new Error(); return res.json(); })
      .then((data: UnmatchedView) => { if (live) { setView(data); setFailed(false); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [allowed, businessId]);
  if (!allowed) return null;
  if (failed) return <p role="alert">Unmatched Stripe payments could not be loaded. Reload to try again.</p>;
  if (!view?.count) return null;
  return <div style={{ overflowWrap: "anywhere", marginBottom: 16 }}>
    <p>Stripe received {view.count} payment(s) we couldn&apos;t match to an invoice — record them by hand.</p>
    <details><summary>Amounts and Stripe references</summary>
      <ul>{view.payments.map(payment => <li key={payment.eventId}>
        {payment.amount.toFixed(2)} {payment.currency.toUpperCase()} · {payment.eventType} · {[payment.eventId, payment.sessionId, payment.paymentIntentId, payment.chargeId].filter(Boolean).join(" · ")}
      </li>)}</ul>
      {view.count > view.payments.length && <p>Showing the latest {view.payments.length} events.</p>}
    </details>
  </div>;
}
