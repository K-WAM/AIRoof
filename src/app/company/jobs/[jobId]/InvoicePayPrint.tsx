"use client";
import { useEffect, useState } from "react";

export interface SentPayLink { url: string; expiresAt: number }
export function InvoicePayPrint({ link, businessId, jobId, invoiceId }: { link: SentPayLink | null; businessId: string; jobId: string; invoiceId: string | null; deposit?: boolean }) {
  const [ready, setReady] = useState<{ url: string; expiresAt: number; data: string; key: string } | null>(null);
  const key = `${businessId}:${jobId}:${invoiceId}:${link?.url ?? ""}`;
  useEffect(() => {
    let live = true;
    if (!invoiceId) return;
    async function prepare() {
      const query = new URLSearchParams({ businessId, invoiceId: invoiceId! });
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/invoice/pay-link?${query}`, { cache: "no-store" });
      if (!res.ok) { if (live) setReady(null); return; }
      const current = await res.json() as SentPayLink | { url: null };
      if (!current.url || current.expiresAt <= Date.now()) { if (live) setReady(null); return; }
      const code = await import("qrcode");
      const data = await code.toDataURL(current.url, { width: 180, margin: 2, errorCorrectionLevel: "M" });
      if (live) setReady({ ...current, data, key });
    }
    void prepare().catch(() => { if (live) setReady(null); });
    return () => { live = false; };
  }, [link, businessId, jobId, invoiceId, key]);
  if (!ready || ready.key !== key || ready.expiresAt <= Date.now()) return null;
  return <section className="invoice-pay-print" style={{ breakInside: "avoid", marginTop: 16 }}>
    <style>{`.invoice-pay-print { display: none; } @media print { .invoice-pay-print { display: block; } }`}</style>
    <p style={{ fontSize: 10, overflowWrap: "anywhere" }}>Pay online: <a href={ready.url}>{ready.url}</a></p>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={ready.data} width={150} height={150} alt="Scan to pay this invoice" />
  </section>;
}
