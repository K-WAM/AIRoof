import { NextRequest, NextResponse } from "next/server";
import { verifyOwnBusinessRole } from "@/lib/auth/verifyRole";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { getStripeClient, isStripeConfigured } from "@/lib/billing/stripePayments";
import { payNowAvailability } from "@/lib/billing/payNow";
import { isEvaluationBusiness } from "@/lib/comms/evaluationGuard";
import { getAppUrl } from "@/lib/config/appUrl";
import { jsonWithCache } from "@/lib/http/cache";
import type Stripe from "stripe";
import type { BusinessConfig } from "@/types";
import { claimOperation } from "@/lib/ops/ledger";

function connectFlags(account: Stripe.Account) {
  return { accountId: account.id, chargesEnabled: account.charges_enabled === true, payoutsEnabled: account.payouts_enabled === true,
    detailsSubmitted: account.details_submitted === true, updatedAt: Date.now() };
}

function status(business: BusinessConfig) {
  const ready = payNowAvailability({ ...business, billingPrefs: { ...business.billingPrefs, payNow: true }, stripeConfigured: isStripeConfigured() }, { status: "sent", total: 1 });
  return { connected: !!business.stripeConnect?.accountId, chargesEnabled: business.stripeConnect?.chargesEnabled === true,
    ready, payNow: business.billingPrefs?.payNow === true, canConnect: isStripeConfigured() && !isEvaluationBusiness(business) };
}

/** Tenant comes exclusively from the session, including when a body/query names a different business. */
export async function GET(req: NextRequest) {
  const gate = await verifyOwnBusinessRole(req, ["owner", "staff", "viewer"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const ref = db.collection("businesses").doc(gate.user.businessId!);
  const business = (await ref.get()).data() as BusinessConfig | undefined;
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  if (req.nextUrl.searchParams.get("refresh") === "1" && gate.user.role === "owner" && business.stripeConnect?.accountId && isStripeConfigured() && !isEvaluationBusiness(business)) {
    try {
      const account = await getStripeClient().accounts.retrieve(business.stripeConnect.accountId);
      business.stripeConnect = connectFlags(account);
      await ref.update({ stripeConnect: business.stripeConnect });
    } catch { return NextResponse.json({ error: "Stripe status could not be refreshed. Try again." }, { status: 502 }); }
  }
  return jsonWithCache(status(business), "noStore");
}

export async function POST(req: NextRequest) {
  const gate = await verifyOwnBusinessRole(req, ["owner"]);
  if ("error" in gate) return gate.error;
  if (!isStripeConfigured()) return NextResponse.json({ error: "Online payments are not configured yet." }, { status: 503 });
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const businessId = gate.user.businessId!;
  const ref = db.collection("businesses").doc(businessId);
  const business = (await ref.get()).data() as BusinessConfig | undefined;
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  if (isEvaluationBusiness(business)) return NextResponse.json({ error: "Online payments are paused for this workspace." }, { status: 403 });
  try {
    const stripe = getStripeClient();
    let accountId = business.stripeConnect?.accountId;
    if (!accountId) {
      const setup = await claimOperation({ businessId, opId: "stripe-connect-account", kind: "stripe-connect-setup" }, { firestore: db });
      // Stripe retains idempotency keys for at least 24 hours. An unresolved older creation needs reconciliation,
      // never a fresh account that might strand money on the first account.
      if (Date.now() - setup.operation.claimedAt.toMillis() >= 23 * 60 * 60 * 1000) return NextResponse.json({ error: "Stripe setup needs office review before it can be retried." }, { status: 409 });
      // Stripe's idempotency key covers concurrent requests and a lost response before Firestore is updated.
      const account = await stripe.accounts.create({ type: "standard", metadata: { businessId } }, { idempotencyKey: `connect-standard-${businessId}` });
      accountId = await db.runTransaction(async tx => {
        const current = await tx.get(ref);
        const saved = current.data()?.stripeConnect?.accountId as string | undefined;
        if (saved) return saved;
        tx.update(ref, { stripeConnect: connectFlags(account) });
        tx.update(ref.collection("operations").doc("stripe-connect-account"), { state: "succeeded", lastProviderId: account.id });
        return account.id;
      });
    }
    const link = await stripe.accountLinks.create({ account: accountId, type: "account_onboarding",
      return_url: `${getAppUrl()}/company/settings?stripeReturn=1#getting-paid`,
      refresh_url: `${getAppUrl()}/company/settings?stripeRefresh=1#getting-paid` });
    return jsonWithCache({ url: link.url }, "noStore");
  } catch { return NextResponse.json({ error: "Stripe setup could not be opened. Try again." }, { status: 502 }); }
}

export async function PUT(req: NextRequest) {
  const gate = await verifyOwnBusinessRole(req, ["owner"]);
  if ("error" in gate) return gate.error;
  const input = await req.json().catch(() => null);
  if (typeof input?.payNow !== "boolean") return NextResponse.json({ error: "Choose on or off." }, { status: 400 });
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const ref = db.collection("businesses").doc(gate.user.businessId!);
  const changed = await db.runTransaction(async tx => {
    const business = (await tx.get(ref)).data() as BusinessConfig | undefined;
    if (!business || input.payNow && !status(business).ready) return null;
    tx.update(ref, { "billingPrefs.payNow": input.payNow });
    return status({ ...business, billingPrefs: { ...business.billingPrefs, payNow: input.payNow } });
  });
  return changed ? jsonWithCache(changed, "noStore") : NextResponse.json({ error: "Finish connecting Stripe first." }, { status: 409 });
}
