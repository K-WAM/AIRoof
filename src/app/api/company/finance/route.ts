import { NextRequest, NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole, verifyOwnBusinessRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { rowsFromHistory, rowsFromInvoices, summarizeFinances } from "@/lib/finance/summary";
import { companiesOf, defaultCompany, effectiveCompanyId, isMultiCompany } from "@/lib/companies/companies";
import type { FinanceFilters, FinanceStatus } from "@/types/finance";
import type { InvoiceHistoryRecord } from "@/types/invoiceHistory";
import type { JobInvoice } from "@/types/invoice";

function dateValue(value: string | null, end = false): number | undefined | null {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) return null;
  return ms + (end ? 86399999 : 0);
}
export async function GET(req: NextRequest) {
  const own = await verifyOwnBusinessRole(req, ["owner"]);
  let businessId = "error" in own ? "" : own.user.businessId ?? "";
  if (!businessId) {
    const preview = req.nextUrl.searchParams.get("businessId");
    if (!preview) return "error" in own ? own.error : NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const gate = await verifyAuthAndRole(req, preview, ["owner"]);
    if ("error" in gate || !gate.user.superadmin) return "error" in own ? own.error : NextResponse.json({ error: "Forbidden" }, { status: 403 });
    businessId = preview;
  }
  const q = req.nextUrl.searchParams;
  const from = dateValue(q.get("from")); const to = dateValue(q.get("to"), true);
  const status = q.get("status");
  if (from === null || to === null || (from !== undefined && to !== undefined && from > to) || (status && !["paid", "unpaid", "partly_paid"].includes(status))) return NextResponse.json({ error: "Invalid filters" }, { status: 400 });
  const customer = q.get("customer")?.trim(); const jobType = q.get("jobType")?.trim();
  if ((customer?.length ?? 0) > 200 || (jobType?.length ?? 0) > 200) return NextResponse.json({ error: "Invalid filters" }, { status: 400 });
  const db = getAdminFirestore(); if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const business = db.collection("businesses").doc(businessId); const snap = await business.get();
  if (!snap.exists || snap.data()?.showcase?.finances !== true) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const biz = snap.data()!;
  const multi = isMultiCompany(biz);
  const knownCompanies = companiesOf(biz);
  const companyParam = q.get("company")?.trim();
  if (multi && companyParam && !knownCompanies.some((c) => c.id === companyParam)) return NextResponse.json({ error: "Invalid filters" }, { status: 400 });
  const company = multi ? companyParam || undefined : undefined;
  const [history, invoices] = await Promise.all([business.collection("invoiceHistory").limit(2000).get(), business.collection("invoices").limit(2000).get()]);
  const jobCompanies = multi ? await invoiceJobCompanies(db, businessId, invoices.docs.map((doc) => ({ ...doc.data(), invoiceId: doc.id }) as JobInvoice)) : {};
  const historyRows = rowsFromHistory(history.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as InvoiceHistoryRecord));
  const historyCompanies = multi ? await historyCustomerCompanies(db, business, historyRows) : {};
  const filters: FinanceFilters = { from, to, ...(customer ? { customer } : {}), ...(jobType ? { jobType } : {}), ...(status ? { status: status as FinanceStatus } : {}), ...(company ? { company } : {}) };
  const rows = [...historyRows, ...rowsFromInvoices(invoices.docs.map((doc) => ({ ...doc.data(), invoiceId: doc.id }) as JobInvoice), jobCompanies)];
  // Multi-company: every row carries its effective company. Imported history has no job/company of its own, so it
  // follows the customer it matched (only the referenced customers are read). Single-company: strip every new field
  // while retaining matched customer IDs for navigation.
  const rowsForResponse = rows.map((r) => {
    const copy = { ...r };
    const fromCustomer = copy.customerId ? historyCompanies[copy.customerId] : undefined;
    if (!multi) { delete copy.companyId; return copy; }
    return { ...copy, companyId: effectiveCompanyId(biz, copy.companyId ?? fromCustomer) ?? undefined };
  });
  const summary = summarizeFinances(rowsForResponse, filters, Date.now(), 30, biz.timezone || "America/New_York");
  return jsonWithCache({
    ...summary,
    capped: history.size >= 2000 || invoices.size >= 2000,
    ...(multi ? { companies: knownCompanies.map((c) => ({ id: c.id, name: c.name, shortName: c.shortName, isDefault: c.id === defaultCompany(biz)?.id, logoUrl: null })) } : {}),
  }, "semiStatic");
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

/** Imported history has no company/job of its own; it follows the matched customer's company. Only referenced customers. */
async function historyCustomerCompanies(
  db: Firestore,
  business: FirebaseFirestore.DocumentReference,
  rows: Array<{ customerId?: string }>,
): Promise<Record<string, string>> {
  const ids = [...new Set(rows.map((row) => row.customerId).filter((id): id is string => typeof id === "string"))];
  const out: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const snaps = await db.getAll(...ids.slice(i, i + 100).map((customerId) => business.collection("customers").doc(customerId)));
    for (const customer of snaps) {
      const companyId = customer.data()?.companyId;
      if (typeof companyId === "string") out[customer.id] = companyId;
    }
  }
  return out;
}

