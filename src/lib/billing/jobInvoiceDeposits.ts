import type { JobInvoice } from "@/types/invoice";
import { customerTotals, validCustomerSubtotal } from "./jobCustomerTotals";

export function depositAmount(basis: number, percent: number): number {
  if (!validCustomerSubtotal(basis) || basis <= 0 || !Number.isFinite(percent) || percent < 1 || percent > 100) throw new RangeError("Enter a positive contract amount and a deposit from 1 to 100 percent");
  return Math.round(Math.round(basis * 100) * percent / 100) / 100;
}

export function withInvoiceDeposits(invoice: JobInvoice, deposits: JobInvoice[]): JobInvoice {
  if (invoice.kind === "deposit" || invoice.status !== "draft") return invoice;
  const depositsApplied = deposits.filter(d => d.kind === "deposit" && d.businessId === invoice.businessId && d.jobId === invoice.jobId && (d.status === "sent" || d.status === "paid"))
    .map(d => ({ invoiceId: d.invoiceId, amount: d.total })).sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));
  const totals = customerTotals({ kind: "invoice", invoice, priceMode: invoice.priceMode, customerSubtotal: invoice.customerSubtotal, depositsApplied });
  return { ...invoice, ...totals, depositsApplied };
}
