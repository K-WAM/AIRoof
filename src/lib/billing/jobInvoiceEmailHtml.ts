import type { JobInvoice } from "@/types/invoice";
import { invoiceGroups } from "@/lib/documents/groups";
import { billToBlock, documentShell, footerBlock, invoiceGroupsBlock, letterheadBlock, narrativeBlock, noticesBlock, notesBlock, photosBlock, totalBlock } from "@/lib/documents/emailBlocks";
import type { JobPhotoMeta } from "@/types/jobs";
import type { RenderedNotice } from "@/lib/documents/notices";
import { resolveLetterhead, type LetterheadBusiness } from "@/lib/documents/letterhead";
import { DEFAULT_INVOICE_COPY, fillInvoiceCopy } from "@/lib/documents/invoiceCopy";
import { getVerticalTemplate } from "@/lib/verticals/templates";
import { fmtDate } from "@/lib/format";
import { escapeHtml } from "@/lib/documents/letterhead";
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
  if (invoice.billTo.address) meta.push(["Service at", invoice.billTo.address]);
  if (invoice.showTechnicians && invoice.technicians?.length) meta.push(["Technicians", invoice.technicians.join(", ")]);
  const values = { businessName: business.businessName, address: invoice.billTo.address ?? "the service address", visitDate: issued, industryNoun: getVerticalTemplate(business.industry ?? "").vocab.jobNoun };
  const opening = invoice.opening ?? fillInvoiceCopy(DEFAULT_INVOICE_COPY.opening, values);
  const closing = invoice.closing ?? fillInvoiceCopy(DEFAULT_INVOICE_COPY.closing, values);
  const thankYou = invoice.thankYou ?? fillInvoiceCopy(DEFAULT_INVOICE_COPY.thankYou, values);
  const findingLines = findings.length ? `<section style="padding:18px 0"><h3>Findings and corrective action</h3>${findings.map((finding) => `<p><strong>Problem:</strong> ${escapeHtml(finding.problem)}<br/><strong>Corrective action:</strong> ${escapeHtml(finding.solution)}${finding.note?.trim() ? `<br/><em style="color:#475569">Inspector&#39;s note: ${escapeHtml(finding.note.trim())}</em>` : ""}</p>`).join("")}</section>` : "";
  return documentShell(letterheadBlock(brand, "Invoice", meta) + billToBlock(invoice.billTo) + narrativeBlock(opening) + findingLines + narrativeBlock(invoice.narrative) + invoiceGroupsBlock(invoiceGroups(invoice)) + totalBlock("Total Due", invoice.total, brand.brandColor) + (pay && invoice.status !== "paid" ? howToPayBlock(pay, invoiceBalance({ ...invoice, status: "sent" }), brand.brandColor) : "") + notesBlock(closing) + notesBlock(thankYou) + notesBlock(invoice.notes) + photosBlock(photos) + noticesBlock(notices) + footerBlock(brand));
}
