// STUB (Wave 0, Roof Doctors plan §7). Final signatures, empty results — so the Finances screen (stream K2) can be
// built before the real math (stream K3) merges. K3 replaces the bodies and keeps these exports and signatures exactly.
import type { FinanceFilters, FinanceRow, FinanceSummary } from "@/types/finance";
import type { InvoiceHistoryRecord } from "@/types/invoiceHistory";
import type { JobInvoice } from "@/types/invoice";

export function rowsFromHistory(records: InvoiceHistoryRecord[]): FinanceRow[] {
  void records;
  return [];
}

export function rowsFromInvoices(invoices: JobInvoice[]): FinanceRow[] {
  void invoices;
  return [];
}

export function summarizeFinances(
  rows: FinanceRow[],
  filters: FinanceFilters,
  now: number,
  termsDays = 30,
  tz = "America/New_York",
): FinanceSummary {
  void rows; void termsDays; void tz;
  return {
    asOf: now,
    filters,
    totals: { invoiced: 0, collected: 0, outstanding: 0, pastDue: 0, pastDuePct: 0 },
    aging: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 },
    byMonth: [],
    topOwing: [],
    rows: [],
  };
}
