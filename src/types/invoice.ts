// Persisted job invoices (Phase 12, Phase 4). Distinct from src/types/jobs.ts's
// InvoiceLineItem (the AI's raw suggestions, never persisted) and from
// src/app/admin/invoices/invoiceFlow.ts's LuxorInvoice (Luxor's own platform billing of a
// tenant — a completely separate sequence/collection; see jobInvoiceNumber.ts).

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
  invoiceId: string;   // "INV-1000+" via businesses/{bid}.invoiceCounter — see jobInvoiceNumber.ts
  businessId: string;
  jobId: string;
  customerId?: string;
  billTo: { name: string; email?: string; phone?: string; address?: string }; // snapshot, never re-resolved
  status: "draft" | "sent" | "paid" | "void";
  issuedAt?: number;
  dueAt?: number;
  terms?: string;
  labor: InvoiceLaborLine[];
  materials: InvoiceMaterialLine[];
  other: InvoiceOtherLine[];
  // When true, the customer-facing (emailed) invoice collapses the materials breakdown to one
  // "Materials & supplies" line at the materials subtotal — never nothing (the line items would
  // no longer sum to the total) and never rolled into labor (misstates tax treatment). Purely
  // presentational: materialSubtotal is still computed from the real lines below, which are
  // always stored and always shown in the app itself.
  hideMaterials: boolean;
  hideLabor?: boolean;
  showTechnicians?: boolean;
  technicians?: string[];
  narrative?: string;
  logoId?: string | null; // null = business.logoUrl; undefined = no logo. Logo library not shipped yet (T-092 follow-up).
  notes?: string;
  taxRate: number;
  discount?: JobInvoiceDiscount;
  laborSubtotal: number;
  materialSubtotal: number;
  otherSubtotal: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  amountPaid?: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  sentAt?: number;
  sentTo?: string;
  /** Set by the office's "Mark paid" (sent -> paid). There is no online payment on job invoices. */
  paidAt?: number;
}
