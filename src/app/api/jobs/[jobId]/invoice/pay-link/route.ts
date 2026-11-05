import { NextRequest, NextResponse } from "next/server";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { jsonWithCache } from "@/lib/http/cache";
import { payNowAvailability } from "@/lib/billing/payNow";
import { invoicePayUrl, signPayToken, validPayLink } from "@/lib/billing/payNowToken";
import { isStripeConfigured } from "@/lib/billing/stripePayments";
import { getAppUrl } from "@/lib/config/appUrl";
import type { JobInvoice } from "@/types/invoice";

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff"]);
  if ("error" in gate) return gate.error;
  if (gate.user.superadmin || !gate.user.businessId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const tenant = gate.user.businessId!;
  const { jobId } = await params;
  const invoiceId = req.nextUrl.searchParams.get("invoiceId") ?? "";
  const unavailable = () => jsonWithCache({ error: "Payment link unavailable" }, "noStore", { status: 404 });
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId) || !/^INV-\d+$/.test(invoiceId)) return unavailable();
  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Database unavailable" }, "noStore", { status: 503 });
  const [biz, inv, job] = await Promise.all([
    db.collection("businesses").doc(tenant).get(),
    db.collection(`businesses/${tenant}/invoices`).doc(invoiceId).get(),
    db.collection(`businesses/${tenant}/jobs`).doc(jobId).get(),
  ]);
  const invoice = inv.data() as JobInvoice | undefined;
  if (!biz.exists || !job.exists || !invoice || invoice.businessId !== tenant || invoice.invoiceId !== invoiceId || invoice.jobId !== jobId
    || (job.data()?.businessId !== undefined && job.data()?.businessId !== tenant)
    || (invoice.kind !== "deposit" && job.data()?.invoiceId !== invoiceId)
    || !validPayLink(invoice) || !payNowAvailability({ ...biz.data(), stripeConfigured: isStripeConfigured() }, invoice)) return unavailable();
  return jsonWithCache({ url: invoicePayUrl(getAppUrl(), tenant, invoiceId, signPayToken(tenant, invoiceId, invoice.payLinkNonce!)), expiresAt: invoice.payLinkExpiresAt }, "noStore");
}
