import type { FinanceFilters, FinanceRow, FinanceSummary } from "@/types/finance";
import type { InvoiceHistoryRecord } from "@/types/invoiceHistory";
import type { JobInvoice } from "@/types/invoice";
import { customerTotals } from "@/lib/billing/jobCustomerTotals";
import { invoiceBalance } from "@/lib/billing/customerPayments";

const cents = (n: number) => Math.round(n * 100);
const status = (total: number, balance: number): FinanceRow["status"] => balance === 0 ? "paid" : balance < total ? "partly_paid" : "unpaid";

export function rowsFromHistory(records: InvoiceHistoryRecord[]): FinanceRow[] {
  return records.filter(r => !r.voided).map(r => {
    const total = Math.max(0, cents(r.amount) + cents(r.tax) - cents(r.credits));
    const balance = Math.max(0, Math.min(total, cents(r.amountDue)));
    return { invoiceNo: r.sourceInvoiceId, customer: r.billTo, jobType: r.workName, issuedAt: r.issuedAt, total: total / 100, balance: balance / 100, status: status(total, balance), source: "jobba" };
  });
}
export function rowsFromInvoices(invoices: JobInvoice[]): FinanceRow[] {
  return invoices.filter(i => i.status !== "draft" && i.status !== "void").map(i => {
    const total = cents(customerTotals({ kind: "invoice", invoice: i, priceMode: i.priceMode, customerSubtotal: i.customerSubtotal }).total);
    const balance = cents(invoiceBalance(i));
    return { invoiceNo: i.invoiceId, jobId: i.jobId, customer: i.billTo.name, issuedAt: i.issuedAt ?? i.createdAt, total: total / 100, balance: balance / 100, status: status(total, balance), source: "app" };
  });
}
export function summarizeFinances(rows: FinanceRow[], filters: FinanceFilters, now: number, termsDays = 30, tz = "America/New_York"): FinanceSummary {
  const filtered = rows.filter(r => (filters.from === undefined || r.issuedAt >= filters.from) && (filters.to === undefined || r.issuedAt <= filters.to) && (!filters.customer || r.customer.toLowerCase() === filters.customer.toLowerCase()) && (!filters.jobType || r.jobType === filters.jobType) && (!filters.status || r.status === filters.status)).sort((a,b) => b.issuedAt - a.issuedAt);
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" });
  const monthKey = (time: number) => { const parts = formatter.formatToParts(time); return `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}`; };
  const [year, month] = monthKey(now).split("-").map(Number);
  const byMonth = Array.from({length: 12}, (_, i) => { const d = new Date(Date.UTC(year, month - 12 + i, 1)); return { month: `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`, invoiced: 0, collected: 0 }; });
  const totals = { invoiced: 0, collected: 0, outstanding: 0, pastDue: 0, pastDuePct: 0 };
  const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  const owing = new Map<string, {customer:string; amount:number; invoices:number}>();
  for (const r of filtered) {
    const total = cents(r.total), balance = cents(r.balance), late = Math.floor((now-r.issuedAt)/86400000)-termsDays;
    totals.invoiced += total; totals.collected += total-balance; totals.outstanding += balance;
    if (late > 0) totals.pastDue += balance;
    if (balance > 0) {
      const bucket = late <= 0 ? "current" : late <= 30 ? "d1_30" : late <= 60 ? "d31_60" : late <= 90 ? "d61_90" : "d90plus";
      aging[bucket] += balance;
      const group = owing.get(r.customer) ?? {customer:r.customer, amount:0, invoices:0}; group.amount += balance; group.invoices++; owing.set(r.customer, group);
    }
    const m = byMonth.find(x => x.month === monthKey(r.issuedAt)); if (m) { m.invoiced += total; m.collected += total-balance; }
  }
  totals.pastDuePct = totals.outstanding ? Math.round(totals.pastDue / totals.outstanding * 1000) / 10 : 0;
  for (const key of ["invoiced", "collected", "outstanding", "pastDue"] as const) totals[key] /= 100;
  for (const key of Object.keys(aging) as Array<keyof typeof aging>) aging[key] /= 100;
  for (const m of byMonth) { m.invoiced /= 100; m.collected /= 100; }
  const topOwing = [...owing.values()].sort((a,b) => b.amount-a.amount).slice(0,5).map(x => ({...x, amount:x.amount/100}));
  return { asOf: now, filters, totals, aging, byMonth, topOwing, rows: filtered };
}
