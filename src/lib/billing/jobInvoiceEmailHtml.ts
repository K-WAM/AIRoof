import type { JobInvoice } from "@/types/invoice";
import { invoiceGroups } from "@/lib/documents/groups";
import { billToBlock, documentShell, footerBlock, groupsBlock, letterheadBlock, narrativeBlock, totalBlock } from "@/lib/documents/emailBlocks";
import { resolveLetterhead, type LetterheadBusiness } from "@/lib/documents/letterhead";

export interface InvoiceEmailBusiness extends LetterheadBusiness {}

export function buildJobInvoiceEmailHtml(invoice: JobInvoice, business: InvoiceEmailBusiness): string {
  if (!business.businessName?.trim()) throw new Error("Business name required for invoice email");
  const brand = resolveLetterhead(business);
  const issued = new Date(invoice.issuedAt ?? invoice.createdAt).toLocaleDateString("en-US");
  const due = new Date(invoice.dueAt ?? invoice.createdAt + 30 * 86400000).toLocaleDateString("en-US");
  const meta: [string, string][] = [["Date", issued], ["Number", invoice.invoiceId], ["Terms", invoice.terms ?? `Due ${due}`], ["Reference", invoice.jobId]];
  if (invoice.billTo.address) meta.push(["Service at", invoice.billTo.address]);
  if (invoice.showTechnicians && invoice.technicians?.length) meta.push(["Technicians", invoice.technicians.join(", ")]);
  return documentShell(letterheadBlock(brand, "Invoice", meta) + billToBlock(invoice.billTo) + narrativeBlock(invoice.narrative) + groupsBlock(invoiceGroups(invoice)) + totalBlock("Total Due", invoice.total) + (invoice.notes ? narrativeBlock(invoice.notes) : "") + footerBlock(brand));
}
