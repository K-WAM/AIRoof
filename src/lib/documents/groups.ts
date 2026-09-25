import type { DocumentOptions } from "@/types/documentOptions";
import { normalizeDocumentOptions } from "@/types/documentOptions";
import type { JobInvoice } from "@/types/invoice";
import type { JobQuote } from "@/types/quote";
import { computeTotals } from "@/app/company/jobs/[jobId]/jobInvoice";
import { quoteTotal } from "@/lib/billing/jobQuote";

export interface DocumentRow { description: string; detail?: string; amount: number }
export interface DocumentGroup { title: "Labor" | "Materials" | "Other"; rows: DocumentRow[]; subtotal: number }

function collapse(title: DocumentGroup["title"], rows: DocumentRow[], subtotal: number, hidden: boolean): DocumentGroup {
  return { title, rows: hidden && rows.length ? [{ description: title, amount: subtotal }] : rows, subtotal };
}

export function invoiceGroups(invoice: JobInvoice, options?: Partial<DocumentOptions>): DocumentGroup[] {
  const flags = normalizeDocumentOptions({ ...invoice, ...options });
  const totals = computeTotals(invoice);
  return [
    collapse("Labor", invoice.labor.map((line) => ({ description: line.name, detail: `${line.hours} hours × $${line.rate.toFixed(2)}`, amount: line.total })), totals.laborSubtotal, flags.hideLabor),
    collapse("Materials", invoice.materials.map((line) => ({ description: line.item, detail: `${line.quantity} ${line.unit ?? ""} × $${line.unitPrice.toFixed(2)}`, amount: line.total })), totals.materialSubtotal, flags.hideMaterials),
    { title: "Other" as const, rows: invoice.other.map((line) => ({ description: line.description, amount: line.amount })), subtotal: totals.otherSubtotal },
  ].filter((group) => group.rows.length);
}

export function quoteGroups(quote: JobQuote, options?: Partial<DocumentOptions>): DocumentGroup[] {
  const flags = normalizeDocumentOptions({ ...quote, ...options });
  const byKind = (kind: JobQuote["lines"][number]["kind"]) => quote.lines.filter((line) => line.kind === kind);
  return (["labor", "material", "other"] as const).map((kind) => {
    const lines = byKind(kind);
    const title = kind === "labor" ? "Labor" : kind === "material" ? "Materials" : "Other";
    return collapse(title, lines.map((line) => ({ description: line.description, detail: `${line.quantity} ${line.unit ?? ""} × $${line.unitPrice.toFixed(2)}`, amount: Math.round(line.quantity * line.unitPrice * 100) / 100 })), quoteTotal(lines), kind === "labor" ? flags.hideLabor : kind === "material" ? flags.hideMaterials : false);
  }).filter((group) => group.rows.length);
}
