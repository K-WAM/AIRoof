"use client";
import { useEffect, useState } from "react";

/** The bearer URL exists only in the sending tab. SHA-256 storage deliberately cannot recover it after reload. */
export interface SentPayLink { url: string; hash: string; expiresAt: number }
export function InvoicePayPrint({ link, businessId, jobId, invoiceId, deposit = false }: { link: SentPayLink | null; businessId: string; jobId: string; invoiceId: string | null; deposit?: boolean }) {
  const [qr, setQr] = useState<{ hash: string; data: string } | null>(null);
  useEffect(() => {
    let live = true;
    if (!link || !invoiceId || link.expiresAt <= Date.now()) return;
    async function prepare() {
      const query = new URLSearchParams({ businessId, ...(deposit ? { invoiceId: invoiceId! } : {}) });
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/invoice?${query}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      // The same server availability rule used by the pay page and send route decides whether this prints.
      if (!data.payNowAvailable || data.invoice?.payTokenHash !== link!.hash) return;
      const code = await import("qrcode");
      const png = await code.toDataURL(link!.url, { width: 180, margin: 2, errorCorrectionLevel: "M" });
      if (live) setQr({ hash: link!.hash, data: png });
    }
    void prepare().catch(() => {});
    return () => { live = false; };
  }, [link, businessId, jobId, invoiceId, deposit]);
  if (!link || !qr || qr.hash !== link.hash || link.expiresAt <= Date.now()) return null;
  return <section className="invoice-pay-print" style={{ breakInside: "avoid", marginTop: 16 }}>
    <style>{`.invoice-pay-print { display: none; } @media print { .invoice-pay-print { display: block; } }`}</style>
    <p style={{ fontSize: 10, overflowWrap: "anywhere" }}>Pay online: <a href={link.url}>{link.url}</a></p>
    {/* Data URI generated locally from the authorized sender's live link. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={qr.data} width={150} height={150} alt="Scan to pay this invoice" />
  </section>;
}
