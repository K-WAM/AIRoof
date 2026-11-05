import type { JobInvoice } from "@/types/invoice";
import { invoiceGroups } from "@/lib/documents/groups";
import { adjustmentsBlock, billToBlock, documentShell, footerBlock, invoiceGroupsBlock, letterheadBlock, narrativeBlock, noticesBlock, notesBlock, photosBlock, totalBlock } from "@/lib/documents/emailBlocks";
import type { JobPhotoMeta } from "@/types/jobs";
import type { RenderedNotice } from "@/lib/documents/notices";
import { resolveLetterhead, type LetterheadBusiness } from "@/lib/documents/letterhead";
import { DEFAULT_INVOICE_COPY, fillInvoiceCopy } from "@/lib/documents/invoiceCopy";
import { getVerticalTemplate } from "@/lib/verticals/templates";
import { fmtDate } from "@/lib/format";
import { escapeHtml } from "@/lib/documents/letterhead";
import { fmtMoney } from "@/lib/format/money";
import { howToPayBlock, invoiceBalance, type EffectiveBillingPrefs } from "@/lib/billing/customerPayments";

export type InvoiceEmailBusiness = LetterheadBusiness & { industry?: string; timezone?: string };

/** `notices` are only what noticesForDocument() approved for an invoice (empty until the owner approves the wording). */
/** `pay` = the client's own payment details (Settings → Getting paid); printed as "How to pay" under the total. */
export function buildJobInvoiceEmailHtml(invoice: JobInvoice, business: InvoiceEmailBusiness, findings: Array<{ problem: string; solution: string; note?: string }> = [], notices: RenderedNotice[] = [], photos: Array<JobPhotoMeta & { fullB64?: string }> = [], pay?: Pick<EffectiveBillingPrefs, "payInstructions" | "payLink">): string {
  if (!business.businessName?.trim()) throw new Error("Business name required for invoice email");
  const brand = resolveLetterhead(business);
  const issued = fmtDate(invoice.issuedAt ?? invoice.createdAt, business.timezone ?? "America/New_York");
  const due = fmtDate(invoice.dueAt ?? invoice.issuedAt ?? invoice.createdAt, business.timezone ?? "America/New_York");
  const meta: [string, string][] = [["Date", issued], ["Number", invoice.invoiceId], ["Terms", invoice.terms ?? DEFAULT_INVOICE_COPY.terms], ["Due", due], ["Work order", invoice.jobId]];
  if (invoice.poNumber) meta.push(["PO number", invoice.poNumber]);
  if (invoice.description !== undefined) meta.push(["Description", invoice.description]);
  if (invoice.customerCode) meta.push(["Customer ID", invoice.customerCode]);
  if (invoice.serviceAt === undefined && invoice.billTo.address) meta.push(["Service at", invoice.billTo.address]);
  if (invoice.showTechnicians && invoice.technicians?.length) meta.push(["Technicians", invoice.technicians.join(", ")]);
  const values = { businessName: business.businessName, address: invoice.billTo.address ?? "the service address", visitDate: issued, industryNoun: getVerticalTemplate(business.industry ?? "").vocab.jobNoun };
  const opening = invoice.opening ?? fillInvoiceCopy(DEFAULT_INVOICE_COPY.opening, values);
  const closing = invoice.closing ?? fillInvoiceCopy(DEFAULT_INVOICE_COPY.closing, values);
  const thankYou = invoice.thankYou ?? fillInvoiceCopy(DEFAULT_INVOICE_COPY.thankYou, values);
  const findingLines = findings.length ? `<section style="padding:18px 0"><h3>Findings and corrective action</h3>${findings.map((finding) => `<p><strong>Problem:</strong> ${escapeHtml(finding.problem)}<br/><strong>Corrective action:</strong> ${escapeHtml(finding.solution)}${finding.note?.trim() ? `<br/><em style="color:#475569">Inspector&#39;s note: ${escapeHtml(finding.note.trim())}</em>` : ""}</p>`).join("")}</section>` : "";
  const groups = invoiceGroups(invoice);
  // Tax/discount rows so the line subtotals visibly add up to Total Due; one Notes block, not three.
  const adjustments = adjustmentsBlock({ lineSum: groups.reduce((sum, group) => sum + group.subtotal, 0), subtotal: invoice.subtotal, taxRate: invoice.taxRate, taxAmount: invoice.taxAmount });
  const deposits = (invoice.depositsApplied ?? []).map(d => `<div style="padding:8px 0">Less deposit (${escapeHtml(d.invoiceId)}) <strong>−${escapeHtml(fmtMoney(d.amount))}</strong></div>`).join("") + (invoice.depositsApplied?.length ? "<p>Tax is calculated on work; deposits are deducted after tax.</p>" : "");
  const notes = [closing, thankYou, invoice.notes].map((text) => text?.trim()).filter(Boolean).join("\n\n");
  return documentShell(letterheadBlock(brand, "Invoice", meta) + billToBlock(invoice.billTo) + (invoice.serviceAt === undefined ? "" : billToBlock({ name: invoice.serviceAt }, "Service at")) + narrativeBlock(opening) + findingLines + narrativeBlock(invoice.narrative) + invoiceGroupsBlock(groups) + adjustments + deposits + totalBlock(invoice.status === "paid" ? "Invoice total — paid in full" : "Total Due", invoice.total, brand.brandColor) + (pay && invoice.status !== "paid" ? howToPayBlock(pay, invoiceBalance({ ...invoice, status: "sent" }), brand.brandColor) : "") + notesBlock(notes) + photosBlock(photos) + noticesBlock(notices) + footerBlock(brand));
}
