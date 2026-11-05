import { NextRequest, NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { daysPastDue, invoiceBalance } from "@/lib/billing/customerPayments";
import { roundCents } from "@/lib/format/money";
import { companiesOf, defaultCompany, effectiveCompanyId, isMultiCompany } from "@/lib/companies/companies";
import { loadBusinessConfig } from "@/lib/products/productCache";
import type { JobInvoice } from "@/types/invoice";

// GET /api/company/billing?businessId= — the Billing screen (Billing product): what customers owe, what's late, what
// came in this month, and the invoices behind those numbers. One bounded query on the business's own invoices
// (status in sent/paid — a single-field filter, no composite index); the newest MAX_INVOICES. Drafts bill nobody, so
// they're not money owed.

const MAX_INVOICES = 300;

export interface BillingRow {
  invoiceId: string; jobId: string; customer: string; total: number; balance: number;
  /** Multi-company only: the row's effective company. Missing = the default company. */
  companyId?: string;
  /** Deposit invoices show a "Deposit" chip (T-304f). Missing = standard. */
  kind?: "standard" | "deposit";
  status: "sent" | "paid"; sentAt?: number; dueAt?: number; paidAt?: number; daysLate: number;
}

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "viewer", "superadmin"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  // Reuse the business document the product guard already read for this request (src/lib/products/productCache.ts),
  // so identifying the client's companies adds no business-document read.
  const { business: biz } = await loadBusinessConfig(db, businessId);
  const multi = isMultiCompany(biz);
  const knownCompanies = companiesOf(biz);
  const companyParam = req.nextUrl.searchParams.get("company")?.trim();
  if (multi && companyParam && !knownCompanies.some((c) => c.id === companyParam)) return NextResponse.json({ error: "Invalid company" }, { status: 400 });
  const company = multi ? companyParam || undefined : undefined;

  const snap = await db.collection(`businesses/${businessId}/invoices`)
    .where("status", "in", ["sent", "paid"])
    .select("jobId", "billTo", "total", "amountPaid", "status", "sentAt", "dueAt", "paidAt", "payments", "updatedAt", "companyId")
    .limit(MAX_INVOICES)
    .get();

  const jobCompanies = multi ? await invoiceJobCompanies(db, businessId, snap.docs.map((doc) => ({ ...doc.data(), invoiceId: doc.id }) as JobInvoice)) : {};
  const now = Date.now();
  const monthStart = new Date(now); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  let owed = 0, overdue = 0, paidThisMonth = 0;
  const rows: BillingRow[] = [];
  for (const doc of snap.docs) {
    const inv = doc.data() as JobInvoice;
    const companyId = multi ? effectiveCompanyId(biz, inv.companyId ?? jobCompanies[inv.jobId]) ?? undefined : undefined;
    if (company && companyId !== company) continue;
    const balance = invoiceBalance(inv);
    const daysLate = daysPastDue(inv, now);
    if (inv.status === "sent") { owed += balance; if (daysLate > 0) overdue += balance; }
    // Money in this month: each recorded payment by its date; a one-step "Mark paid" (no payments list) by paidAt.
    if (inv.payments?.length) paidThisMonth += inv.payments.filter((p) => p.receivedAt >= monthStart.getTime()).reduce((s, p) => s + p.amount, 0);
    else if (inv.status === "paid" && (inv.paidAt ?? 0) >= monthStart.getTime()) paidThisMonth += inv.amountPaid ?? inv.total;
    rows.push({ invoiceId: doc.id, jobId: inv.jobId, customer: inv.billTo?.name || "—", ...(companyId ? { companyId } : {}), total: inv.total, balance, status: inv.status as "sent" | "paid", ...(inv.kind === "deposit" ? { kind: "deposit" as const } : {}), sentAt: inv.sentAt, dueAt: inv.dueAt, paidAt: inv.paidAt, daysLate });
  }
  const unpaid = rows.filter((r) => r.status === "sent").sort((a, b) => b.daysLate - a.daysLate || (a.dueAt ?? 0) - (b.dueAt ?? 0));
  const paid = rows.filter((r) => r.status === "paid").sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0)).slice(0, 20);
  return jsonWithCache({
    totals: { owed: roundCents(owed), overdue: roundCents(overdue), paidThisMonth: roundCents(paidThisMonth), unpaidCount: unpaid.length, overdueCount: unpaid.filter((r) => r.daysLate > 0).length },
    unpaid, paid, capped: snap.size >= MAX_INVOICES,
    ...(multi ? { companies: knownCompanies.map((c) => ({ id: c.id, name: c.name, shortName: c.shortName, isDefault: c.id === defaultCompany(biz)?.id, logoUrl: null })) } : {}),
  }, "volatile");
}

/** The job's company for invoices that carry none (the money row rule: invoice.companyId ?? job.companyId). */
async function invoiceJobCompanies(
  db: Firestore,
  businessId: string,
  invoices: JobInvoice[],
): Promise<Record<string, string | undefined>> {
  const ids = [...new Set(invoices.filter((i) => typeof i.companyId !== "string" && typeof i.jobId === "string").map((i) => i.jobId))];
  const out: Record<string, string | undefined> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const refs = ids.slice(i, i + 100).map((jobId) => db.collection("businesses").doc(businessId).collection("jobs").doc(jobId));
    const snaps = await db.getAll(...refs);
    for (const job of snaps) {
      const companyId = job.data()?.companyId;
      if (typeof companyId === "string") out[job.id] = companyId;
    }
  }
  return out;
}
