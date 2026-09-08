import Stripe from "stripe";
import { getCapabilityStatus, requireEnv } from "@/lib/config/env";
import type { LineItem } from "@/app/admin/invoices/invoiceFlow";

export function isStripeConfigured(): boolean {
  return getCapabilityStatus("stripe") === "configured";
}

let cachedClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (!cachedClient) {
    cachedClient = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  }
  return cachedClient;
}

export interface CheckoutLinkResult {
  status: "created" | "unconfigured" | "failed";
  url?: string;
  sessionId?: string;
  error?: string;
}

/**
 * Creates a one-time Stripe Checkout Session for a Luxor invoice and returns
 * its hosted URL — card, Apple Pay, and Google Pay all render automatically,
 * no separate integration per payment method. Each real line item collapses
 * to a single fixed-price Stripe line (quantity 1, amount = item.total):
 * Stripe's Checkout `quantity` must be a positive integer, and this app's
 * line items can carry fractional quantities (e.g. 3.5 labor hours), so
 * re-deriving unit_amount × quantity here would either violate that
 * constraint or drift from the amount actually shown on the invoice. Tax
 * (already computed and stored on the invoice) is appended as its own line
 * so the Checkout total matches the invoice total exactly — the invoice
 * remains the single source of truth for the amount owed, this only turns
 * it into something payable.
 *
 * Deliberately does not flip invoice status to "paid" — no webhook, by
 * design (see the LuxorInvoice.stripePaymentUrl comment). A superadmin still
 * confirms payment landed and clicks "Mark paid" themselves.
 */
export async function createInvoiceCheckoutLink(opts: {
  invoiceId: string;
  clientName: string;
  lineItems: LineItem[];
  taxRate: number;
  taxAmount: number;
  clientEmail?: string;
  baseUrl: string;
}): Promise<CheckoutLinkResult> {
  if (!isStripeConfigured()) return { status: "unconfigured" };

  const billableItems = opts.lineItems.filter((item) => item.total > 0);
  if (billableItems.length === 0) {
    return { status: "failed", error: "Invoice has no billable line items" };
  }

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = billableItems.map((item) => ({
    quantity: 1,
    price_data: {
      currency: "usd",
      unit_amount: Math.round(item.total * 100),
      product_data: { name: item.description?.trim() || "Line item" },
    },
  }));

  if (opts.taxAmount > 0) {
    line_items.push({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: Math.round(opts.taxAmount * 100),
        product_data: { name: `Tax (${opts.taxRate}%)` },
      },
    });
  }

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      customer_email: opts.clientEmail || undefined,
      success_url: `${opts.baseUrl}/pay/success?invoice=${encodeURIComponent(opts.invoiceId)}`,
      cancel_url: `${opts.baseUrl}/pay/cancelled?invoice=${encodeURIComponent(opts.invoiceId)}`,
      metadata: { invoiceId: opts.invoiceId, clientName: opts.clientName },
    });

    if (!session.url) {
      return { status: "failed", error: "Stripe did not return a checkout URL" };
    }
    return { status: "created", url: session.url, sessionId: session.id };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : "Unknown Stripe error" };
  }
}
