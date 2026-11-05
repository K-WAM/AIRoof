// Finances (Roof Doctors plan §7, T-294/T-301). Computed by src/lib/finance/summary.ts (pure), shown by
// /company/finances. Money is summed in integer cents inside the math and returned as dollars with 2 decimals.

export type FinanceStatus = "paid" | "unpaid" | "partly_paid";

export interface FinanceRow {
  invoiceNo: string;
  jobId?: string;
  customer: string;
  jobType?: string;
  /** ms */
  issuedAt: number;
  /** Dollars. */
  total: number;
  /** Dollars still owed. */
  balance: number;
  status: FinanceStatus;
  source: "app" | "jobba";
}

export interface FinanceFilters {
  /** ms, inclusive */
  from?: number;
  /** ms, inclusive */
  to?: number;
  customer?: string;
  jobType?: string;
  status?: FinanceStatus;
}

export interface FinanceSummary {
  asOf: number;
  filters: FinanceFilters;
  totals: { invoiced: number; collected: number; outstanding: number; pastDue: number; pastDuePct: number };
  /** Outstanding balance by days past due. */
  aging: { current: number; d1_30: number; d31_60: number; d61_90: number; d90plus: number };
  /** Month key "YYYY-MM" in the business timezone, oldest first. */
  byMonth: Array<{ month: string; invoiced: number; collected: number }>;
  /** Top 5 customers by outstanding balance. */
  topOwing: Array<{ customer: string; amount: number; invoices: number }>;
  /** Filtered rows, newest first. */
  rows: FinanceRow[];
}
