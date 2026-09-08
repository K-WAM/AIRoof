"use client";

import { Suspense } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { XCircle } from "lucide-react";

// Stripe Checkout's cancel_url — public, no auth. The checkout link itself
// still works afterward (Stripe Checkout Sessions aren't consumed by a
// cancel), so there's nothing to regenerate — just point them back to
// whoever sent the invoice.
function PayCancelledInner() {
  const searchParams = useSearchParams();
  const invoiceId = searchParams?.get("invoice");

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <Image src="/logo.png" alt="Luxor AI" width={403} height={322} priority style={{ width: 64, height: "auto", margin: "0 auto 20px" }} />
        <XCircle size={40} strokeWidth={1.5} style={{ color: "#94a3b8", marginBottom: 12 }} />
        <h1 style={{ fontSize: 20, margin: "0 0 10px" }}>Payment cancelled</h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
          No charge was made{invoiceId ? ` for invoice ${invoiceId}` : ""}. Use the same payment link from your
          invoice email whenever you&apos;re ready, or contact us with any questions.
        </p>
      </div>
    </div>
  );
}

export default function PayCancelledPage() {
  return (
    <Suspense fallback={null}>
      <PayCancelledInner />
    </Suspense>
  );
}
