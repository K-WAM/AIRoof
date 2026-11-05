import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole, verifyOwnBusinessRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { rowsFromHistory, rowsFromInvoices, summarizeFinances } from "@/lib/finance/summary";
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
  const [history, invoices] = await Promise.all([business.collection("invoiceHistory").limit(2000).get(), business.collection("invoices").limit(2000).get()]);
  const filters: FinanceFilters = { from, to, ...(customer ? { customer } : {}), ...(jobType ? { jobType } : {}), ...(status ? { status: status as FinanceStatus } : {}) };
  const rows = [...rowsFromHistory(history.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as InvoiceHistoryRecord)), ...rowsFromInvoices(invoices.docs.map((doc) => ({ ...doc.data(), invoiceId: doc.id }) as JobInvoice))];
  return jsonWithCache({ ...summarizeFinances(rows, filters, Date.now(), 30, snap.data()?.timezone || "America/New_York"), capped: history.size >= 2000 || invoices.size >= 2000 }, "semiStatic");
}
