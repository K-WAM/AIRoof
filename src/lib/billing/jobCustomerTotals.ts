import { roundCents } from "@/lib/format/money";
import { computeTotals } from "@/app/company/jobs/[jobId]/jobInvoice";
import type { JobInvoice } from "@/types/invoice";

export type PriceMode = "lines" | "project";

export function validCustomerSubtotal(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10_000_000 && Math.abs(Math.round(value * 100) - value * 100) < 1e-7;
}

const round2 = roundCents;

/** The only calculation of persisted customer figures for quote and invoice. */
type QuoteInput = { kind: "quote"; lineSubtotal: number; priceMode?: PriceMode; customerSubtotal?: number };
type InvoiceInput = {
  kind: "invoice";
  invoice: Pick<JobInvoice, "labor" | "materials" | "other" | "taxRate" | "discount">;
  priceMode?: PriceMode;
  customerSubtotal?: number;
};
export function customerTotals(input: QuoteInput): { calculatedSubtotal: number; subtotal: number; total: number; taxAmount: number };
export function customerTotals(input: InvoiceInput): ReturnType<typeof computeTotals> & { calculatedSubtotal: number };
export function customerTotals(input: QuoteInput | InvoiceInput) {
  if (input.kind === "quote") {
    const calculatedSubtotal = round2(input.lineSubtotal);
    const subtotal = input.priceMode === "project" ? input.customerSubtotal : calculatedSubtotal;
    if (input.priceMode === "project" && !validCustomerSubtotal(subtotal)) throw new Error("Invalid customer subtotal");
    if (subtotal === undefined) throw new Error("Invalid customer subtotal");
    return { calculatedSubtotal, subtotal, total: subtotal, taxAmount: 0 };
  }
  const lineTotals = computeTotals({ ...input.invoice, discount: undefined });
  const calculatedSubtotal = round2(lineTotals.laborSubtotal + lineTotals.materialSubtotal + lineTotals.otherSubtotal);
  if (input.priceMode !== "project") return { ...computeTotals(input.invoice), calculatedSubtotal };
  if (!validCustomerSubtotal(input.customerSubtotal)) throw new Error("Invalid customer subtotal");
  const subtotal = input.customerSubtotal;
  const taxAmount = round2(subtotal * (input.invoice.taxRate / 100));
  return { ...lineTotals, calculatedSubtotal, subtotal, taxAmount, total: round2(subtotal + taxAmount) };
}
