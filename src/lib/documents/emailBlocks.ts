import { groupFindingsByCategory, type DocumentFinding } from "./findingGroups";
import type { DocumentGroup } from "./groups";
import type { Letterhead } from "./letterhead";
import { escapeHtml } from "./letterhead";
import type { ReportQuoteSection } from "./reportQuote";
import type { RenderedNotice } from "./notices";
import { photoPages } from "./photoPages";
import type { JobPhotoMeta } from "@/types/jobs";
import { fmtPhone } from "@/lib/format/phone";
import { fmtMoney } from "@/lib/format/money";
import { addressLines, classicAccent, classicGroupTitle, classicKind, displayWebsite } from "./documentStyle";

const money = (value: number) => fmtMoney(value);
const cell = "padding:9px 12px;border-bottom:1px solid #e2e8f0";

/** The accent every block of one email uses: the brand colour, or each look's own default. */
export function emailAccent(brand: Letterhead): string {
  if (brand.documentStyle === "classic") return classicAccent(brand.brandColor);
  return /^#[0-9a-f]{6}$/i.test(brand.brandColor ?? "") ? brand.brandColor! : "#0f766e";
}

/** Classic letterhead (documentStyle): logo with address, phone/fax and license on the left; title and details right. */
function classicLetterheadBlock(brand: Letterhead, title: string, meta: [string, string][]): string {
  const accent = classicAccent(brand.brandColor);
  const name = escapeHtml(brand.businessName ?? "");
  const kind = classicKind(title);
  const phoneFax = [brand.contactPhone ? `Phone: ${fmtPhone(brand.contactPhone)}` : "", brand.fax ? `Fax: ${fmtPhone(brand.fax)}` : ""].filter(Boolean).map(escapeHtml).join("&nbsp;&nbsp;");
  const from = addressLines(brand.address).map((line) => `<div>${escapeHtml(line.toUpperCase())}</div>`).join("")
    + (phoneFax ? `<div>${phoneFax}</div>` : "")
    + (brand.licenseNumber ? `<div>STATE LICENSE #${escapeHtml(brand.licenseNumber)}</div>` : "");
  const logo = brand.logoUrl ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${name}" style="display:block;max-width:220px;max-height:92px;object-fit:contain;margin-bottom:6px"/>` : `<div style="font-size:19px;font-weight:800">${name}</div>`;
  const titleStyle = kind === "invoice" || kind === "quote"
    ? `font-size:30px;font-weight:500;color:${accent}`
    : `font-size:22px;font-weight:800;font-style:italic;text-transform:uppercase;color:${accent}`;
  const rows = meta.map(([key, value], i) => `<tr><td style="padding:1px 10px 1px 0;font-weight:700;white-space:nowrap;vertical-align:top;color:${i < 2 ? "#1d4ed8" : "#111827"}">${escapeHtml(kind === "invoice" && key === "Number" ? "Invoice No." : key)}:</td><td style="padding:1px 0;vertical-align:top">${escapeHtml(value)}</td></tr>`).join("");
  return `<table role="presentation" style="width:100%;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif"><tr><td style="vertical-align:top;width:50%;padding-right:12px">${logo}<div style="font-size:11px;line-height:1.45;color:#111827">${from}</div></td><td style="vertical-align:top;width:50%"><div style="${titleStyle};border-bottom:2px solid #111827;padding-bottom:4px">${escapeHtml(title)}</div><table role="presentation" style="border-collapse:collapse;font-size:12px;margin-top:8px">${rows}</table></td></tr></table><div style="border-top:3px double #111827;margin:16px 0 4px"></div>`;
}

/** The classic typed letter's top: optional slogan, the brand-colour bar with the company line, then the logo. */
export function classicLetterTopBlock(brand: Letterhead): string {
  const accent = classicAccent(brand.brandColor);
  const name = escapeHtml(brand.businessName ?? "");
  const line = [brand.businessName, (brand.address ?? "").replace(/\s*\n\s*/g, ", "), brand.contactPhone ? `Phone ${fmtPhone(brand.contactPhone)}` : "", brand.fax ? `Fax ${fmtPhone(brand.fax)}` : ""].filter(Boolean).map((part) => escapeHtml(part!)).join(" &bull; ");
  const logo = brand.logoUrl ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${name}" style="display:block;max-width:240px;max-height:100px;object-fit:contain;margin:14px 0 6px"/>` : `<div style="font-size:21px;font-weight:800;margin:14px 0 6px">${name}</div>`;
  return (brand.tagline ? `<div style="text-align:center;color:${accent};font-style:italic;font-weight:700;font-size:17px;margin-bottom:4px">${escapeHtml(brand.tagline)}</div>` : "")
    + (brand.licenseNumber ? `<div style="font-size:11px">STATE LICENSE #${escapeHtml(brand.licenseNumber)}</div>` : "")
    + `<div style="background:${accent};color:#fff;text-align:center;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.03em;padding:5px 10px;line-height:1.4">${line}</div>${logo}`;
}

export function letterheadBlock(brand: Letterhead, title: string, meta: [string, string][]): string {
  if (brand.documentStyle === "classic") return classicLetterheadBlock(brand, title, meta);
  const accent = /^#[0-9a-f]{6}$/i.test(brand.brandColor ?? "") ? brand.brandColor : "#0f766e";
  const name = escapeHtml(brand.businessName ?? "");
  const lines = [brand.address, brand.contactPhone, brand.contactEmail].filter(Boolean).map((v) => `<div>${escapeHtml(v!)}</div>`).join("") + (brand.licenseNumber ? `<div>License #${escapeHtml(brand.licenseNumber)}</div>` : "");
  const logo = brand.logoUrl ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${name}" style="max-width:140px;max-height:54px;object-fit:contain"/>` : "";
  return `<table style="width:100%;border-bottom:3px solid ${accent};padding-bottom:20px"><tr><td style="vertical-align:top">${logo}<div style="font-size:18px;font-weight:800">${name}</div><div style="font-size:12px;line-height:1.6;color:#475569">${lines}</div></td><td style="vertical-align:top;text-align:right"><div style="font-size:28px;font-weight:800;color:${accent}">${escapeHtml(title)}</div>${meta.map(([key, value]) => `<div style="font-size:12px;line-height:1.6"><strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}</div>`).join("")}</td></tr></table>`;
}

export function billToBlock(billTo: { name: string; address?: string; phone?: string }, label = "Bill to"): string {
  if (!billTo.name && !billTo.address) return "";
  return `<section style="padding:20px 0;border-bottom:1px solid #e2e8f0"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b">${escapeHtml(label)}</div><strong>${escapeHtml(billTo.name)}</strong>${billTo.address ? `<div>${escapeHtml(billTo.address)}</div>` : ""}${billTo.phone ? `<div>${escapeHtml(fmtPhone(billTo.phone))}</div>` : ""}</section>`;
}

export function narrativeBlock(narrative?: string): string {
  return narrative ? `<section style="padding:20px 0;white-space:pre-wrap;line-height:1.6"><strong>Description of work</strong><p>${escapeHtml(narrative)}</p></section>` : "";
}

export function notesBlock(notes?: string): string {
  return notes ? `<section style="padding:16px 0;white-space:pre-wrap;font-size:12px;color:#475569"><strong>Notes</strong><p>${escapeHtml(notes)}</p></section>` : "";
}

export function findingsBlock(findings: Array<{ problem: string; solution: string; note?: string }>): string {
  return findings.length ? `<section style="padding:18px 0"><strong>Issues found &amp; work recommended</strong>${findings.map((finding) => `<p style="line-height:1.5"><strong>${escapeHtml(finding.problem)}</strong><br/>${escapeHtml(finding.solution)}${finding.note?.trim() ? `<br/><em style="color:#475569">Inspector&#39;s note: ${escapeHtml(finding.note.trim())}</em>` : ""}</p>`).join("")}</section>` : "";
}

export function findingSectionsBlock(findings: readonly DocumentFinding[]): string {
  return groupFindingsByCategory(findings).map(group => `<section class="document-finding-category" style="padding:18px 0"><h3>${escapeHtml(group.category)}</h3><ol style="margin:0;padding-left:24px;list-style-type:decimal">${group.findings.map(finding => `<li class="document-finding" style="padding:0 0 10px 4px;white-space:pre-wrap;break-inside:avoid"><p style="margin:4px 0"><strong>Problem:</strong> ${escapeHtml(finding.problem)}</p><p style="margin:4px 0"><strong>Corrective Action:</strong> ${escapeHtml(finding.solution)}</p>${finding.note?.trim() ? `<p style="margin:4px 0"><em>Inspector&#39;s note: ${escapeHtml(finding.note.trim())}</em></p>` : ""}</li>`).join("")}</ol></section>`).join("");
}

export function groupsBlock(groups: DocumentGroup[]): string {
  return groups.map((group) => `<section style="margin:20px 0">${group.title === "Project price" ? "" : `<h3 style="font-size:13px;color:#334155">${group.title}</h3>`}<table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${group.rows.map((row) => `<tr><td style="${cell}">${escapeHtml(row.description)}${row.detail ? `<div style="font-size:11px;color:#64748b">${escapeHtml(row.detail)}</div>` : ""}</td><td style="${cell};text-align:right;font-weight:600">${money(row.amount)}</td></tr>`).join("")}</tbody></table>${group.title === "Project price" ? "" : `<div style="text-align:right;padding:8px 12px;font-weight:700">${group.title} subtotal: ${money(group.subtotal)}</div>`}</section>`).join("");
}

/** Classic look: one boxed Item / Description / Quantity / Unit Price / Amount table, a subtotal under each group. */
function classicGroupsTable(groups: DocumentGroup[]): string {
  const b = "border:1px solid #111827";
  const head = ["Item", "Description", "Quantity", "Unit Price", "Amount"].map((h, i) => `<th style="${b};padding:4px 8px;text-align:${i >= 2 ? "right" : "left"}">${h}</th>`).join("");
  const body = groups.map((group) => {
    const name = classicGroupTitle(group.title);
    const rows = group.rows.map((row, i) => {
      const described = row.item && row.item !== group.title && row.item !== "Labor" && row.item !== "Other" ? `${escapeHtml(row.item)}${row.description && row.description !== "Material" ? `<br/><span style="color:#4b5563">${escapeHtml(row.description)}</span>` : ""}` : escapeHtml(row.description);
      return `<tr><td style="padding:5px 8px;vertical-align:top;font-weight:${i === 0 ? 700 : 400}">${i === 0 && group.title !== "Project price" ? escapeHtml(name) : ""}</td><td style="padding:5px 8px;vertical-align:top">${described}${row.detail ? `<div style="color:#4b5563">${escapeHtml(row.detail)}</div>` : ""}</td><td style="padding:5px 8px;text-align:right;vertical-align:top">${row.quantity !== undefined ? row.quantity.toFixed(2) : ""}</td><td style="padding:5px 8px;text-align:right;vertical-align:top">${row.unitPrice !== undefined ? money(row.unitPrice) : ""}</td><td style="padding:5px 8px;text-align:right;vertical-align:top;white-space:nowrap">${money(row.amount)}</td></tr>`;
    }).join("");
    const subtotal = group.title === "Project price" ? "" : `<tr><td colspan="3" style="padding:3px 8px 10px;text-align:right;font-weight:700">${escapeHtml(name)}</td><td style="padding:3px 8px 10px;text-align:right;font-weight:700;border-top:1px solid #111827">Subtotal</td><td style="padding:3px 8px 10px;text-align:right;font-weight:700;border-top:1px solid #111827;white-space:nowrap">${money(group.subtotal)}</td></tr>`;
    return rows + subtotal;
  }).join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:12px;margin:16px 0;font-family:Arial,Helvetica,sans-serif"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function invoiceGroupsBlock(groups: DocumentGroup[], classic = false): string {
  if (classic) return classicGroupsTable(groups);
  return groups.map((group) => group.title === "Project price" ? `<section style="margin:20px 0"><table style="width:100%"><tbody><tr><td style="${cell}">Project price</td><td style="${cell};text-align:right;font-weight:600">${money(group.subtotal)}</td></tr></tbody></table></section>` : `<section style="margin:20px 0"><h3 style="font-size:13px;color:#334155">${escapeHtml(group.title)}</h3><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>${["Item", "Description", "Qty", "Unit price", "Amount"].map((heading) => `<th style="${cell};text-align:left">${heading}</th>`).join("")}</tr></thead><tbody>${group.rows.map((row) => `<tr><td style="${cell}">${escapeHtml(row.item ?? group.title)}</td><td style="${cell}">${escapeHtml(row.description)}</td><td style="${cell}">${row.quantity ?? ""}</td><td style="${cell}">${row.unitPrice === undefined ? "" : money(row.unitPrice)}</td><td style="${cell}">${money(row.amount)}</td></tr>`).join("")}</tbody></table><div style="text-align:right;padding:8px 12px;font-weight:700">${escapeHtml(group.title)} subtotal: ${money(group.subtotal)}</div></section>`).join("");
}

/**
 * "Terms & notices" at the end of a quote or invoice. Callers pass only what noticesForDocument() approved for THIS document
 * (nothing at all until the owner has approved the wording), so an empty list prints nothing. Statutory notices are boxed and bold.
 */
export function noticesBlock(notices: RenderedNotice[] | undefined): string {
  if (!notices?.length) return "";
  return `<section style="margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0"><h3 style="font-size:13px;color:#334155;margin:0 0 8px">Terms &amp; notices</h3>${notices.map((notice) => `<div style="margin:0 0 12px;${notice.statutory ? "border:1px solid #94a3b8;padding:10px 12px;" : ""}"><div style="font-size:12px;font-weight:700;color:#334155">${escapeHtml(notice.title)}</div><div style="font-size:12px;line-height:1.55;color:#475569;white-space:pre-wrap;${notice.statutory ? "font-weight:700;" : ""}">${escapeHtml(notice.text)}</div></div>`).join("")}</section>`;
}

/** The report's optional "Include the quote" block: heading, the (possibly collapsed) price groups, and the quoted total. */
export function quoteSectionBlock(section: ReportQuoteSection | null, accent?: string | null): string {
  if (!section) return "";
  return `<section style="margin-top:28px"><h3 style="font-size:14px;color:#334155;margin:0 0 4px">${escapeHtml(section.heading)}</h3>${groupsBlock(section.groups)}${totalBlock("Quoted total", section.total, accent)}</section>`;
}

export function sectionsBlock(sections: Array<{ title: string; lines: string[] }>): string {
  return sections.map((section) => `<section style="margin:20px 0"><h3 style="font-size:13px;color:#334155">${escapeHtml(section.title)}</h3><table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${section.lines.map((line) => `<tr><td style="${cell}">${escapeHtml(line)}</td></tr>`).join("")}</tbody></table></section>`).join("");
}

/** Subtotal / discount / tax rows between the line groups and the boxed total, so the page adds up.
 *  Nothing when there is neither a discount nor tax (the group subtotals already sum to the total). */
export function adjustmentsBlock(opts: { lineSum: number; subtotal: number; taxRate: number; taxAmount: number }): string {
  const discount = Math.round((opts.lineSum - opts.subtotal) * 100) / 100;
  if (discount <= 0 && opts.taxAmount <= 0) return "";
  const rows: [string, string][] = [["Subtotal", money(opts.lineSum)]];
  if (discount > 0) rows.push(["Discount", `−${money(discount)}`]);
  if (opts.taxAmount > 0) rows.push([`Tax (${opts.taxRate}%)`, money(opts.taxAmount)]);
  return `<table style="width:100%;margin:0 0 10px;font-size:13px"><tbody>${rows.map(([label, value]) => `<tr><td style="padding:3px 12px;text-align:right;color:#475569">${escapeHtml(label)}</td><td style="padding:3px 12px;text-align:right;width:120px;white-space:nowrap">${value}</td></tr>`).join("")}</tbody></table>`;
}

export function totalBlock(label: string, amount: number, accent?: string | null): string {
  const color = /^#[0-9a-f]{6}$/i.test(accent ?? "") ? accent : "#0f766e";
  return `<div style="border:2px solid ${color};border-radius:6px;padding:12px 16px;text-align:right;font-size:17px;font-weight:800">${escapeHtml(label)}: <span style="white-space:nowrap">${money(amount)}</span></div>`;
}

export function footerBlock(brand: Letterhead): string {
  if (brand.documentStyle === "classic") {
    const site = displayWebsite(brand.websiteUrl);
    if (!brand.licenseNumber && !site) return "";
    return `<table role="presentation" style="width:100%;margin-top:32px;border-top:1px solid #d1d5db;font-size:11px;color:#374151;font-family:Arial,Helvetica,sans-serif"><tr><td style="padding-top:10px">${brand.licenseNumber ? `LIC# ${escapeHtml(brand.licenseNumber)}` : ""}</td><td style="padding-top:10px;text-align:right">${site ? `<span style="color:${classicAccent(brand.brandColor)};text-transform:uppercase;text-decoration:underline">${escapeHtml(site)}</span>` : ""}</td></tr></table>`;
  }
  return `<footer style="margin-top:32px;padding-top:14px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#64748b">${[brand.businessName, brand.licenseNumber, brand.websiteUrl].filter(Boolean).map((v) => escapeHtml(v!)).join(" &middot; ")}</footer>`;
}

export function photosBlock(photos: Array<JobPhotoMeta & { fullB64?: string; cid?: string }> = []): string {
  if (!photos.length) return "";
  const image = (photo: (JobPhotoMeta & { fullB64?: string; cid?: string }) | undefined, heading: string) => !photo ? '<td style="width:50%;padding:6px"></td>' : `<td style="width:50%;padding:6px;vertical-align:top"><strong style="font-size:11px;color:#475569">${heading}</strong><img src="${photo.cid ? `cid:${photo.cid}` : photo.fullB64 ? `data:image/jpeg;base64,${photo.fullB64}` : `data:image/jpeg;base64,${photo.thumbB64}`}" alt="${escapeHtml(photo.label)}" style="display:block;width:100%;margin-top:5px;border:1px solid #e2e8f0;border-radius:6px"/><div style="font-size:12px;color:#475569;margin-top:4px">${escapeHtml(photo.label)}</div></td>`;
  return photoPages(photos).map((page, index) => `<section style="margin-top:24px;${index ? "page-break-before:always;" : ""}"><h3 style="font-size:13px">Photo documentation</h3><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:6px">Before</th><th style="text-align:left;padding:6px">After</th></tr></thead><tbody>${page.rows.map((row) => `<tr style="break-inside:avoid;page-break-inside:avoid">${image(row.before, row.before?.phase === "before" ? "Before" : "Photo")}${image(row.after, row.after?.phase === "after" ? "After" : "Photo")}</tr>`).join("")}</tbody></table></section>`).join("");
}

export function documentShell(content: string, preheader?: string): string {
  if (preheader) content = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px">${escapeHtml(preheader)}</div>` + content;
  // Email-client safe card: a centered table (Outlook ignores <main> and max-width on block elements), a web-safe font
  // fallback after system-ui, lang + viewport so phones render at width, and rounded corners where supported.
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="x-apple-disable-message-reformatting"/></head><body style="margin:0;padding:16px 8px;background:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1e293b;-webkit-text-size-adjust:100%"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;border-collapse:separate;background:#fff;border:1px solid #e2e8f0;border-radius:12px"><tr><td style="padding:28px 24px">${content}</td></tr></table></td></tr></table></body></html>`;
}
