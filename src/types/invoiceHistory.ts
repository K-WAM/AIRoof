// Imported invoice and work history from a previous system (Roof Doctors plan §7, T-291/T-306).
//
// READ-ONLY records. They live in their own collections so that NO send, reminder, cron or payment path can ever
// pick them up: businesses/{businessId}/invoiceHistory/{id} and businesses/{businessId}/jobHistory/{id}.
// Never copy one of these into businesses/{businessId}/invoices — the reminder cron would email real customers.

export type HistorySource = "jobba";

export interface InvoiceHistoryRecord {
  /** `${source}-${sourceInvoiceId}` — stable, so a re-import overwrites instead of duplicating. */
  id: string;
  source: HistorySource;
  /** The source system's invoice number, e.g. "0012345". */
  sourceInvoiceId: string;
  /** ms at local noon of the source "Date" column, in the business's timezone. */
  issuedAt: number;
  /** The source "Name" column (the kind of work, e.g. "Maintenance"). */
  workName: string;
  /** The source "Bill To" column (customer name). */
  billTo: string;
  /** Our customer, when matched by matchKey. */
  customerId?: string;
  /** Dollars, 2 decimals. */
  amount: number;
  tax: number;
  credits: number;
  amountDue: number;
  /** ms, from the source "Paid" date column. */
  paidAt?: number;
  voided: boolean;
  /** The source system's status text, kept as-is. */
  status: string;
  importedAt: number;
}

/** A past inspection / work order from the source system, shown read-only on the customer page. */
export interface JobHistoryRecord {
  id: string;
  source: HistorySource;
  sourceId: string;
  customerId?: string;
  customerName: string;
  property?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  status: string;
  jobType?: string;
  createdBy?: string;
  dueAt?: number;
  importedAt: number;
}
