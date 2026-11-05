import { after, NextRequest, NextResponse } from "next/server";
import { getEnv, getCapabilityStatus } from "@/lib/config/env";
import { getStripeClient } from "@/lib/billing/stripePayments";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { handleConnectEvent } from "@/lib/billing/stripeConnectEvents";
import type Stripe from "stripe";

// Public provider endpoint: raw-body Stripe signature, never a session or unsigned fallback.
export async function POST(req: NextRequest) {
  if (getCapabilityStatus("stripeConnectWebhook") !== "configured") return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  let event: Stripe.Event;
  try { event = getStripeClient().webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", getEnv("STRIPE_CONNECT_WEBHOOK_SECRET")!); }
  catch { return NextResponse.json({ error: "Invalid signature" }, { status: 400 }); }
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  try { await handleConnectEvent(db, event, after); }
  catch { console.error("stripe-connect processing failed", event.id); return NextResponse.json({ error: "Retry later" }, { status: 500 }); }
  return NextResponse.json({ received: true });
}
