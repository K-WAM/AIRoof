// Persisted job invoices (Phase 12, Phase 4). Distinct from src/types/jobs.ts's
// InvoiceLineItem (the AI's raw suggestions, never persisted) and from
// src/app/admin/invoices/invoiceFlow.ts's LuxorInvoice (Luxor's own platform billing of a
// tenant — a completely separate sequence/collection; see jobInvoiceNumber.ts).
import type { Provenance } from "./provenance";

export interface InvoiceLaborLine {
  lineId: string;
  name: string;
  arrival?: string;
  departure?: string;
  hours: number;
  rate: number;
  total: number;
  // Provenance: "punch" once Phase 5's punched labor reaches invoices (not wired yet — the
  // job.parsed labor a draft is built from already carries source: "voice" | "punch" per
  // buildProjection's merge rule; this mirrors that onto the invoice line).
  source: "punch" | "voice" | "manual";
  day?: string; // dayKey, for punch/voice reconciliation
}

export interface InvoiceMaterialLine {
  lineId: string;
  item: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  total: number;
  source: "voice" | "manual" | "catalog";
}

export interface InvoiceOtherLine {
  lineId: string;
  description: string;
  amount: number;
}

export interface JobInvoiceDiscount {
  kind: "amount" | "percent";
  value: number;
}

export interface JobInvoice {
  /** Company this invoice is issued under (src/lib/companies/companies.ts resolveDocumentCompany); frozen once sent. */
  companyId?: string;
  /** Set only on an invoice made on a sample job (T-376): kept out of Finances, removed with the sample job. */
  provenance?: Provenance;
  payLinkNonce?: string;
  payLinkExpiresAt?: number;
  payNowPending?: { sessionId: string; at: number };
  payNowCheckout?: { sessionId: string; method: "card" | "us_bank_account"; amount: number; payLinkNonce?: string; createdAt: number };
  payNowCheckoutAttempt?: { nonce: string; method: "card" | "us_bank_account"; amount: number; payLinkNonce: string };
  payNowNotice?: string;
  serviceAt?: string;
  description?: string;
  customerCode?: string;
  invoiceId: string;   // "INV-1000+" via businesses/{bid}.invoiceCounter — see jobInvoiceNumber.ts
  businessId: string;
  jobId: string;
  customerId?: string;
  billTo: { name: string; email?: string; phone?: string; address?: string }; // snapshot, never re-resolved
  status: "draft" | "sent" | "paid" | "void";
  issuedAt?: number;
  dueAt?: number;
  terms?: string;
  opening?: string;
  closing?: string;
  thankYou?: string;
  poNumber?: string;
  labor: InvoiceLaborLine[];
  materials: InvoiceMaterialLine[];
  other: InvoiceOtherLine[];
  // When true, the customer-facing (emailed) invoice collapses the materials breakdown to one
  // "Materials & supplies" line at the materials subtotal — never nothing (the line items would
  // no longer sum to the total) and never rolled into labor (misstates tax treatment). Purely
  // presentational: materialSubtotal is still computed from the real lines below, which are
  // always stored and always shown in the app itself.
  hideMaterials: boolean;
  priceMode?: "lines" | "project";
  /** Roof Doctors plan §7 (T-304f). Missing = "standard". A deposit invoice is its own document with its own number. */
  kind?: "standard" | "deposit";
  /** Deposit invoices: the percent requested, 1-100. */
  depositPercent?: number;
  depositRequestId?: string;
  /** Deposit invoices: the contract amount (dollars) the percent was taken from. */
  depositBasis?: number;
  /** Deposit invoices: when the customer agreed to the work (ms). */
  depositAgreementDate?: number;
  /** Standard invoice: deposits already billed, shown as negative "Less deposit" lines. */
  depositsApplied?: Array<{ invoiceId: string; amount: number }>;
  customerSubtotal?: number;
  calculatedSubtotal?: number;
  adjustmentNote?: string;
  hideLabor?: boolean;
  showTechnicians?: boolean;
  photoIds?: string[];
  technicians?: string[];
  narrative?: string;
  logoId?: string | null; // null = business.logoUrl; undefined = no logo. Logo library not shipped yet (T-092 follow-up).
  showFindingSections?: boolean;
  notes?: string;
  taxRate: number;
  discount?: JobInvoiceDiscount;
  laborSubtotal: number;
  materialSubtotal: number;
  otherSubtotal: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  /** Sum of `payments` (cents-rounded). Paid in full flips status to "paid". */
  amountPaid?: number;
  /** Staff-recorded payments, Stripe receipts and negative Stripe refund entries. */
  payments?: InvoicePayment[];
  /** Overdue reminders already emailed to the customer, by days late (1, 7, 14) — each goes once. */
  remindersSent?: number[];
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  sentAt?: number;
  sentTo?: string;
  /** When the last payment arrived (paid in full). */
  paidAt?: number;
}

export interface InvoicePayment {
  source?: "stripe";
  stripeRefunded?: number;
  paymentId: string;
  amount: number;
  method: "cash" | "check" | "card" | "bank" | "zelle" | "other";
  /** When the money arrived (may be back-dated, never future). */
  receivedAt: number;
  note?: string;
  recordedBy: string;
  recordedAt: number;
}
