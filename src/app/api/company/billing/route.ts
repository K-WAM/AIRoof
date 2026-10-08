import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { daysPastDue, invoiceBalance } from "@/lib/billing/customerPayments";
import { roundCents } from "@/lib/format/money";
import type { JobInvoice } from "@/types/invoice";

// GET /api/company/billing?businessId= — the Billing screen (Billing product): what customers owe, what's late, what
// came in this month, and the invoices behind those numbers. One bounded query on the business's own invoices
// (status in sent/paid — a single-field filter, no composite index); the newest MAX_INVOICES. Drafts bill nobody, so
// they're not money owed.

const MAX_INVOICES = 300;

export interface BillingRow {
  invoiceId: string; jobId: string; customer: string; total: number; balance: number;
  status: "sent" | "paid"; sentAt?: number; dueAt?: number; paidAt?: number; daysLate: number;
}

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "viewer", "superadmin"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const snap = await db.collection(`businesses/${businessId}/invoices`)
    .where("status", "in", ["sent", "paid"])
    .select("jobId", "billTo", "total", "amountPaid", "status", "sentAt", "dueAt", "paidAt", "payments", "updatedAt")
    .limit(MAX_INVOICES)
    .get();

  const now = Date.now();
  const monthStart = new Date(now); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  let owed = 0, overdue = 0, paidThisMonth = 0;
  const rows: BillingRow[] = [];
  for (const doc of snap.docs) {
    const inv = doc.data() as JobInvoice;
    const balance = invoiceBalance(inv);
    const daysLate = daysPastDue(inv, now);
    if (inv.status === "sent") { owed += balance; if (daysLate > 0) overdue += balance; }
    // Money in this month: each recorded payment by its date; a one-step "Mark paid" (no payments list) by paidAt.
    if (inv.payments?.length) paidThisMonth += inv.payments.filter((p) => p.receivedAt >= monthStart.getTime()).reduce((s, p) => s + p.amount, 0);
    else if (inv.status === "paid" && (inv.paidAt ?? 0) >= monthStart.getTime()) paidThisMonth += inv.amountPaid ?? inv.total;
    rows.push({ invoiceId: doc.id, jobId: inv.jobId, customer: inv.billTo?.name || "—", total: inv.total, balance, status: inv.status as "sent" | "paid", sentAt: inv.sentAt, dueAt: inv.dueAt, paidAt: inv.paidAt, daysLate });
  }
  const unpaid = rows.filter((r) => r.status === "sent").sort((a, b) => b.daysLate - a.daysLate || (a.dueAt ?? 0) - (b.dueAt ?? 0));
  const paid = rows.filter((r) => r.status === "paid").sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0)).slice(0, 20);
  return jsonWithCache({
    totals: { owed: roundCents(owed), overdue: roundCents(overdue), paidThisMonth: roundCents(paidThisMonth), unpaidCount: unpaid.length, overdueCount: unpaid.filter((r) => r.daysLate > 0).length },
    unpaid, paid, capped: snap.size >= MAX_INVOICES,
  }, "volatile");
}
