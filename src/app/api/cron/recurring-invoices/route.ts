// Drafts a monthly Luxor invoice for clients who opted into billing.autoInvoice.
// Deliberately drafts only — it never sends. A superadmin still reviews and
// clicks "Send saved invoice" from /admin/invoices themselves, so a wrong
// dollar amount can never go out unattended. Runs daily; each client's own
// billing.nextInvoiceDate is what makes this fire roughly once a month per
// client (mirrors the follow-up-calls cron's per-business-field gating).

import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/auth/cronGuard";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { nextLuxorInvoiceNumber } from "@/lib/billing/invoiceNumber";
import type { LuxorInvoice } from "@/app/admin/invoices/invoiceFlow";

const DUE_IN_DAYS = 30;
const ELIGIBLE_QUERY_LIMIT = 50;

function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

function isoDateInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const now = Date.now();
  const drafted: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  try {
    const businesses = await db
      .collection("businesses")
      .where("billing.autoInvoice", "==", true)
      .limit(ELIGIBLE_QUERY_LIMIT)
      .get();

    for (const businessDoc of businesses.docs) {
      const businessId = businessDoc.id;
      const business = businessDoc.data();
      const billing = business.billing as
        | { planName?: string; monthlyAmount?: number; nextInvoiceDate?: number }
        | undefined;

      const nextInvoiceDate = billing?.nextInvoiceDate;
      if (typeof nextInvoiceDate !== "number" || nextInvoiceDate > now) {
        skipped.push(businessId);
        continue;
      }
      const monthlyAmount = billing?.monthlyAmount;
      if (typeof monthlyAmount !== "number" || monthlyAmount <= 0) {
        skipped.push(businessId);
        continue;
      }

      try {
        const invoiceId = await nextLuxorInvoiceNumber(db);
        const planName = billing?.planName?.trim() || "AI receptionist";
        const period = new Date(now).toLocaleDateString("en-US", { month: "long", year: "numeric" });

        const invoice: LuxorInvoice = {
          invoiceId,
          businessId,
          clientName: typeof business.businessName === "string" ? business.businessName : businessId,
          clientEmail:
            typeof business.notificationEmail === "string"
              ? business.notificationEmail
              : typeof business.contactEmail === "string"
                ? business.contactEmail
                : "",
          clientAddress: typeof business.address === "string" ? business.address : undefined,
          lineItems: [
            {
              description: `${planName} — monthly subscription (${period})`,
              quantity: 1,
              unitPrice: monthlyAmount,
              total: monthlyAmount,
            },
          ],
          notes: "Net 30. Payment due within 30 days of invoice date. Auto-drafted from your recurring plan — review before sending.",
          taxRate: 0,
          subtotal: monthlyAmount,
          taxAmount: 0,
          total: monthlyAmount,
          status: "draft",
          dueDate: isoDateInDays(DUE_IN_DAYS),
          createdAt: now,
        };

        await db.collection("luxorInvoices").doc(invoiceId).set(invoice);
        await businessDoc.ref.update({
          "billing.nextInvoiceDate": addMonths(nextInvoiceDate, 1),
          updatedAt: now,
        });

        drafted.push(invoiceId);
      } catch (error) {
        errors.push(`${businessId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }

  return NextResponse.json({ ok: true, drafted, skipped, errors });
}
