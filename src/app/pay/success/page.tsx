"use client";

import { Suspense } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

// Stripe Checkout's success_url — public, no auth (the payer is a client's
// customer or the client themselves, not a portal user). Purely a courtesy
// confirmation: this app has no payment webhook, so the invoice itself isn't
// marked paid until a superadmin confirms it landed and clicks "Mark paid".
function PaySuccessInner() {
  const searchParams = useSearchParams();
  const invoiceId = searchParams?.get("invoice");

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <Image src="/logo.png" alt="Luxor AI" width={403} height={322} priority style={{ width: 64, height: "auto", margin: "0 auto 20px" }} />
        <CheckCircle2 size={40} strokeWidth={1.5} style={{ color: "#16a34a", marginBottom: 12 }} />
        <h1 style={{ fontSize: 20, margin: "0 0 10px" }}>Payment received</h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
          Thanks{invoiceId ? ` — your payment for invoice ${invoiceId}` : ""} went through. You&apos;ll get an
          updated invoice once it&apos;s confirmed on our end. No further action needed.
        </p>
      </div>
    </div>
  );
}

export default function PaySuccessPage() {
  return (
    <Suspense fallback={null}>
      <PaySuccessInner />
    </Suspense>
  );
}
