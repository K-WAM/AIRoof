// Builds the HTML for an emailed job invoice — extracted from the send route (Phase 12, Phase 4
// follow-up) so the customer-facing email and a future preview/test can't drift from each other,
// mirroring how src/app/company/jobs/[jobId]/jobInvoice.ts already separates the invoice's pure
// math from its two call sites (client preview, server PATCH).
//
// Deliberately its own template rather than notify.ts's shared `shell()` wrapper: shell() is a
// colored-header-bar "SaaS notification" look, right for a crew assignment or a password-reset
// email. An invoice is a document the tenant's own customer keeps for their records, so it's
// styled instead like a classic printed invoice — a white letterhead with the tenant's logo/
// address on the left and "Invoice" + Date/Invoice No./Due on the right — matching the in-app
// invoice-doc render (job detail page, Invoice tab) so both are the same document family. No
// Luxor AI branding here on purpose: this document represents the tenant's business to *their*
// customer, not the platform.

import type { JobInvoice } from "@/types/invoice";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

// Only the branding fields this template reads — a caller shouldn't have to construct a whole
// fake BusinessConfig just to satisfy a wider type than the logic needs (same convention as
// jobInvoice.ts's BusinessConfigDefaults).
export interface InvoiceEmailBusiness {
  businessName?: string;
  brandColor?: string | null;
  logoUrl?: string | null;
  address?: string;
  contactPhone?: string;
  contactEmail?: string;
  websiteUrl?: string;
}

export function buildJobInvoiceEmailHtml(invoice: JobInvoice, business: InvoiceEmailBusiness): string {
  const accent = business.brandColor || "#1e3a5f";
  const bizName = business.businessName?.trim();
  if (!bizName) throw new Error("Business name required for invoice email");

  const today = new Date(invoice.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const due = new Date(invoice.dueAt ?? invoice.createdAt + 30 * 86400000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const laborRowsHtml = invoice.labor.map((l) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">${esc(l.name || "—")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b">${esc(l.arrival || "—")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b">${esc(l.departure || "—")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right">${l.hours || 0}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right">$${l.rate}/hr</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">${fmt(l.total)}</td>
    </tr>`).join("");

  // hideMaterials: collapse to one lump line at the real materialSubtotal — never nothing (the
  // line items would stop summing to the total) and never rolled into labor (misstates tax
  // treatment). The in-app view and the printed/PDF view apply this same rule (see the job detail
  // page's own .no-print/.print-only twin-render for the Materials section).
  const materialsHtml = invoice.materials.length === 0 ? "" : invoice.hideMaterials
    ? `<tr><td colspan="4" style="padding:8px 12px;border-bottom:1px solid #f1f5f9">Materials &amp; supplies</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">${fmt(invoice.materialSubtotal)}</td></tr>`
    : invoice.materials.map((m) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">${esc(m.item || "—")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right">${m.quantity || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b">${esc(m.unit || "—")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right">$${m.unitPrice.toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">${fmt(m.total)}</td>
    </tr>`).join("");

  const otherRowsHtml = invoice.other.filter((o) => o.description).map((o) => `
    <tr>
      <td colspan="4" style="padding:8px 12px;border-bottom:1px solid #f1f5f9">${esc(o.description)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">${fmt(o.amount)}</td>
    </tr>`).join("");

  const metaRows = ([
    ["Date", today],
    ["Invoice No.", invoice.invoiceId],
    ["Due", due],
  ] as const).map(([k, v]) => `<tr><td style="padding:1px 8px 1px 0;text-align:right;font-weight:700;color:${accent};white-space:nowrap">${esc(k)}:</td><td style="padding:1px 0;text-align:left;color:#1e293b;white-space:nowrap">${esc(v)}</td></tr>`).join("");

  const addressLines = [
    business.address ? `${esc(business.address)}<br/>` : "",
    [business.contactPhone, business.contactEmail].filter(Boolean).map((v) => esc(v as string)).join("  &middot;  "),
    business.websiteUrl ? `<br/>${esc(business.websiteUrl)}` : "",
  ].join("");

  const billTo = invoice.billTo.name || invoice.billTo.address
    ? `<div style="margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #e2e8f0">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${accent};margin-bottom:6px">Bill To</div>
        ${invoice.billTo.name ? `<div style="font-weight:700;font-size:15px;color:#0f172a">${esc(invoice.billTo.name)}</div>` : ""}
        ${invoice.billTo.phone ? `<div style="font-size:13px;color:#64748b">${esc(invoice.billTo.phone)}</div>` : ""}
        ${invoice.billTo.address ? `<div style="font-size:13px;color:#64748b">${esc(invoice.billTo.address)}</div>` : ""}
      </div>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif">
<div style="max-width:680px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);border:1px solid #e2e8f0">
  <div style="padding:32px 40px 24px;border-bottom:3px solid ${accent};display:flex;justify-content:space-between;align-items:flex-start;gap:20px">
    <div style="display:flex;align-items:center;gap:14px">
      ${business.logoUrl ? `<img src="${esc(business.logoUrl)}" alt="${esc(bizName)}" style="height:44px;max-width:120px;object-fit:contain"/>` : ""}
      <div>
        <div style="font-weight:800;font-size:18px;color:#0f172a">${esc(bizName)}</div>
        <div style="font-size:12px;color:#64748b;margin-top:3px;line-height:1.6">${addressLines}</div>
      </div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-weight:800;font-size:26px;color:${accent};letter-spacing:-0.02em;margin-bottom:8px">Invoice</div>
      <table style="font-size:12px;border-collapse:collapse;margin-left:auto"><tbody>${metaRows}</tbody></table>
    </div>
  </div>
  <div style="padding:28px 40px 32px">
    ${billTo}

    ${invoice.labor.length > 0 ? `
    <div style="margin-bottom:24px">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#475569;margin-bottom:8px">Labor</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0">
        <thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">
          <th style="padding:8px 12px;text-align:left;font-weight:600;color:#64748b">Technician</th>
          <th style="padding:8px 12px;text-align:left;font-weight:600;color:#64748b">Arrival</th>
          <th style="padding:8px 12px;text-align:left;font-weight:600;color:#64748b">Departure</th>
          <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b">Hours</th>
          <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b">Rate</th>
          <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b">Total</th>
        </tr></thead>
        <tbody>${laborRowsHtml}</tbody>
      </table>
    </div>` : ""}

    ${invoice.materials.length > 0 ? `
    <div style="margin-bottom:24px">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#475569;margin-bottom:8px">Materials</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0">
        ${invoice.hideMaterials ? "" : `<thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">
          <th style="padding:8px 12px;text-align:left;font-weight:600;color:#64748b">Item</th>
          <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b">Qty</th>
          <th style="padding:8px 12px;text-align:left;font-weight:600;color:#64748b">Unit</th>
          <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b">Unit Price</th>
          <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b">Total</th>
        </tr></thead>`}
        <tbody>${materialsHtml}</tbody>
      </table>
    </div>` : ""}

    ${invoice.other.length > 0 && otherRowsHtml ? `
    <div style="margin-bottom:24px">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#475569;margin-bottom:8px">Other Charges</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tbody>${otherRowsHtml}</tbody>
      </table>
    </div>` : ""}

    <div style="display:flex;justify-content:flex-end">
      <div style="min-width:260px">
        <table style="width:100%;font-size:13px">
          <tbody>
            <tr><td style="padding:4px 16px 4px 0;color:#64748b">Subtotal</td><td style="text-align:right;font-weight:600">${fmt(invoice.subtotal)}</td></tr>
            ${invoice.taxRate > 0 ? `<tr><td style="padding:4px 16px 4px 0;color:#64748b">Tax (${invoice.taxRate}%)</td><td style="text-align:right;font-weight:600">${fmt(invoice.taxAmount)}</td></tr>` : ""}
          </tbody>
        </table>
        <div style="display:flex;justify-content:space-between;align-items:center;border:1.5px solid ${accent};border-radius:6px;padding:10px 14px;margin-top:10px">
          <span style="font-weight:800;font-size:14px;color:#0f172a">Total Due</span>
          <span style="font-weight:800;font-size:18px;color:${accent}">${fmt(invoice.total)}</span>
        </div>
      </div>
    </div>

    ${invoice.notes ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #f1f5f9;font-size:12px;color:#64748b;white-space:pre-wrap">${esc(invoice.notes)}</div>` : ""}

    <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8">
      ${[bizName, business.websiteUrl, business.contactPhone].filter(Boolean).map((v) => esc(v as string)).join("  &middot;  ")}
    </div>
  </div>
</div>
</body></html>`;
}
