import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { createInvoiceCheckoutLink } from "@/lib/billing/stripePayments";

// POST /api/admin/invoices/[invoiceId]/pay-link — generate (or return the
// already-generated) Stripe Checkout link for this invoice. Persists the
// result on the invoice doc so re-opening it doesn't create a second,
// orphaned Checkout Session for the same invoice.
export async function POST(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;

  const { invoiceId } = await params;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const snap = await db.collection("luxorInvoices").doc(invoiceId).get();
  if (!snap.exists) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const invoice = snap.data()!;

  if (typeof invoice.stripePaymentUrl === "string" && invoice.stripePaymentUrl) {
    return NextResponse.json({ url: invoice.stripePaymentUrl, sessionId: invoice.stripeCheckoutSessionId });
  }

  const result = await createInvoiceCheckoutLink({
    invoiceId,
    clientName: invoice.clientName ?? invoiceId,
    lineItems: invoice.lineItems ?? [],
    taxRate: invoice.taxRate ?? 0,
    taxAmount: invoice.taxAmount ?? 0,
    clientEmail: invoice.clientEmail,
    baseUrl: req.nextUrl.origin,
  });

  if (result.status === "unconfigured") {
    return NextResponse.json(
      { error: "Stripe isn't configured yet — add STRIPE_SECRET_KEY to enable payment links." },
      { status: 503 }
    );
  }
  if (result.status === "failed") {
    return NextResponse.json({ error: result.error ?? "Could not create a payment link" }, { status: 502 });
  }

  await db.collection("luxorInvoices").doc(invoiceId).update({
    stripePaymentUrl: result.url,
    stripeCheckoutSessionId: result.sessionId,
    updatedAt: Date.now(),
  });

  return NextResponse.json({ url: result.url, sessionId: result.sessionId });
}
