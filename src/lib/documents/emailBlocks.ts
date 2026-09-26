import type { DocumentGroup } from "./groups";
import type { Letterhead } from "./letterhead";
import { escapeHtml } from "./letterhead";
import type { ReportQuoteSection } from "./reportQuote";

const money = (value: number) => `$${value.toFixed(2)}`;
const cell = "padding:9px 12px;border-bottom:1px solid #e2e8f0";

export function letterheadBlock(brand: Letterhead, title: string, meta: [string, string][]): string {
  const accent = /^#[0-9a-f]{6}$/i.test(brand.brandColor ?? "") ? brand.brandColor : "#0f766e";
  const name = escapeHtml(brand.businessName ?? "");
  const lines = [brand.address, brand.contactPhone, brand.contactEmail].filter(Boolean).map((v) => `<div>${escapeHtml(v!)}</div>`).join("") + (brand.licenseNumber ? `<div>License #${escapeHtml(brand.licenseNumber)}</div>` : "");
  const logo = brand.logoUrl ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${name}" style="max-width:140px;max-height:54px;object-fit:contain"/>` : "";
  return `<table style="width:100%;border-bottom:3px solid ${accent};padding-bottom:20px"><tr><td style="vertical-align:top">${logo}<div style="font-size:18px;font-weight:800">${name}</div><div style="font-size:12px;line-height:1.6;color:#475569">${lines}</div></td><td style="vertical-align:top;text-align:right"><div style="font-size:28px;font-weight:800;color:${accent}">${escapeHtml(title)}</div>${meta.map(([key, value]) => `<div style="font-size:12px;line-height:1.6"><strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}</div>`).join("")}</td></tr></table>`;
}

export function billToBlock(billTo: { name: string; address?: string; phone?: string }, label = "Bill to"): string {
  if (!billTo.name && !billTo.address) return "";
  return `<section style="padding:20px 0;border-bottom:1px solid #e2e8f0"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b">${escapeHtml(label)}</div><strong>${escapeHtml(billTo.name)}</strong>${billTo.address ? `<div>${escapeHtml(billTo.address)}</div>` : ""}${billTo.phone ? `<div>${escapeHtml(billTo.phone)}</div>` : ""}</section>`;
}

export function narrativeBlock(narrative?: string): string {
  return narrative ? `<section style="padding:20px 0;white-space:pre-wrap;line-height:1.6"><strong>Description of work</strong><p>${escapeHtml(narrative)}</p></section>` : "";
}

export function notesBlock(notes?: string): string {
  return notes ? `<section style="padding:16px 0;white-space:pre-wrap;font-size:12px;color:#475569"><strong>Notes</strong><p>${escapeHtml(notes)}</p></section>` : "";
}

export function findingsBlock(findings: Array<{ problem: string; solution: string }>): string {
  return findings.length ? `<section style="padding:18px 0"><strong>Issues found &amp; work recommended</strong>${findings.map((finding) => `<p style="line-height:1.5"><strong>${escapeHtml(finding.problem)}</strong><br/>${escapeHtml(finding.solution)}</p>`).join("")}</section>` : "";
}

export function groupsBlock(groups: DocumentGroup[]): string {
  return groups.map((group) => `<section style="margin:20px 0"><h3 style="font-size:13px;color:#334155">${group.title}</h3><table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${group.rows.map((row) => `<tr><td style="${cell}">${escapeHtml(row.description)}${row.detail ? `<div style="font-size:11px;color:#64748b">${escapeHtml(row.detail)}</div>` : ""}</td><td style="${cell};text-align:right;font-weight:600">${money(row.amount)}</td></tr>`).join("")}</tbody></table><div style="text-align:right;padding:8px 12px;font-weight:700">${group.title} subtotal: ${money(group.subtotal)}</div></section>`).join("");
}

export function invoiceGroupsBlock(groups: DocumentGroup[]): string {
  return groups.map((group) => `<section style="margin:20px 0"><h3 style="font-size:13px;color:#334155">${escapeHtml(group.title)}</h3><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>${["Item", "Description", "Qty", "Unit price", "Amount"].map((heading) => `<th style="${cell};text-align:left">${heading}</th>`).join("")}</tr></thead><tbody>${group.rows.map((row) => `<tr><td style="${cell}">${escapeHtml(row.item ?? group.title)}</td><td style="${cell}">${escapeHtml(row.description)}</td><td style="${cell}">${row.quantity ?? ""}</td><td style="${cell}">${row.unitPrice === undefined ? "" : money(row.unitPrice)}</td><td style="${cell}">${money(row.amount)}</td></tr>`).join("")}</tbody></table><div style="text-align:right;padding:8px 12px;font-weight:700">${escapeHtml(group.title)} subtotal: ${money(group.subtotal)}</div></section>`).join("");
}

/** The report's optional "Include the quote" block: heading, the (possibly collapsed) price groups, and the quoted total. */
export function quoteSectionBlock(section: ReportQuoteSection | null, accent?: string | null): string {
  if (!section) return "";
  return `<section style="margin-top:28px"><h3 style="font-size:14px;color:#334155;margin:0 0 4px">${escapeHtml(section.heading)}</h3>${groupsBlock(section.groups)}${totalBlock("Quoted total", section.total, accent)}</section>`;
}

export function sectionsBlock(sections: Array<{ title: string; lines: string[] }>): string {
  return sections.map((section) => `<section style="margin:20px 0"><h3 style="font-size:13px;color:#334155">${escapeHtml(section.title)}</h3><table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${section.lines.map((line) => `<tr><td style="${cell}">${escapeHtml(line)}</td></tr>`).join("")}</tbody></table></section>`).join("");
}

export function totalBlock(label: string, amount: number, accent?: string | null): string {
  const color = /^#[0-9a-f]{6}$/i.test(accent ?? "") ? accent : "#0f766e";
  return `<div style="border:2px solid ${color};border-radius:6px;padding:12px 16px;text-align:right;font-size:17px;font-weight:800">${escapeHtml(label)}: ${money(amount)}</div>`;
}

export function footerBlock(brand: Letterhead): string {
  return `<footer style="margin-top:32px;padding-top:14px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#64748b">${[brand.businessName, brand.licenseNumber, brand.websiteUrl].filter(Boolean).map((v) => escapeHtml(v!)).join(" &middot; ")}</footer>`;
}

export function documentShell(content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:20px;background:#f8fafc;font-family:system-ui,sans-serif;color:#1e293b"><main style="max-width:680px;margin:auto;padding:32px;background:#fff;border:1px solid #e2e8f0">${content}</main></body></html>`;
}
