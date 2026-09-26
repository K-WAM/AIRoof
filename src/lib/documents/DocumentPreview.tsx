import type { DocumentGroup } from "./groups";
import type { Letterhead } from "./letterhead";
import type { ReportQuoteSection } from "./reportQuote";
import type { RenderedNotice } from "./notices";

export function DocumentPreview({ title, brand, meta, billTo, partyLabel = "Bill to", opening, narrative, findings, closing, thankYou, groups = [], sections = [], quoteSection, notices = [], totalLabel, total, className = "" }: {
  title: string; brand: Letterhead; meta: [string, string][];
  billTo: { name: string; address?: string; phone?: string }; partyLabel?: string; opening?: string; narrative?: string; findings?: Array<{ problem: string; solution: string }>; closing?: string; thankYou?: string;
  groups?: DocumentGroup[]; sections?: Array<{ title: string; lines: string[] }>; totalLabel?: string; total?: number; className?: string;
  /** REPORT only: the optional "Include the quote" block (a sent/accepted quote's work and prices). Built by reportQuoteSection(). */
  quoteSection?: ReportQuoteSection | null;
  /** QUOTE / INVOICE only: "Terms & notices" — pass what noticesForDocument() approved (nothing until the owner approves the wording). */
  notices?: RenderedNotice[];
}) {
  const accent = /^#[0-9a-f]{6}$/i.test(brand.brandColor ?? "") ? brand.brandColor! : "var(--accent)";
  return <article className={className} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "clamp(16px, 4vw, 44px)", color: "#1e293b", overflowWrap: "anywhere" }}>
    <header style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 24, borderBottom: `3px solid ${accent}`, paddingBottom: 20 }}>
      <div>{brand.logoUrl && <>
        {/* Library logos may be data URIs, which next/image cannot optimize. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logoUrl} alt={brand.businessName ?? ""} style={{ width: "auto", maxWidth: 140, maxHeight: 54, ...brand.logoStyle }} />
      </>}
        <div style={{ fontSize: 19, fontWeight: 800 }}>{brand.businessName}</div>
        {[brand.address, brand.contactPhone, brand.contactEmail].filter(Boolean).map((line, i) => <div key={i} style={{ fontSize: 12, color: "#475569" }}>{line}</div>)}
        {brand.licenseNumber && <div style={{ fontSize: 12, color: "#475569" }}>License #{brand.licenseNumber}</div>}
      </div>
      <div><h2 style={{ margin: "0 0 8px", fontSize: 28, color: accent }}>{title}</h2>{meta.map(([key, value]) => <div key={key} style={{ fontSize: 12 }}><strong>{key}:</strong> {value}</div>)}</div>
    </header>
    <section style={{ padding: "20px 0", borderBottom: "1px solid #e2e8f0" }}><strong>{partyLabel}</strong><div>{billTo.name}</div>{billTo.address && <div>{billTo.address}</div>}{billTo.phone && <div>{billTo.phone}</div>}</section>
    {opening && <section style={{ padding: "20px 0", whiteSpace: "pre-wrap" }}><p>{opening}</p></section>}
    {!!findings?.length && <section style={{ padding: "18px 0" }}><strong>{title === "Invoice" ? "Findings and corrective action" : "Issues found & work recommended"}</strong>{findings.map((finding, index) => <p key={index} style={{ whiteSpace: "pre-wrap" }}>{title === "Invoice" ? <><strong>Problem:</strong> {finding.problem}<br /><strong>Corrective action:</strong> {finding.solution}</> : <><strong>{finding.problem}</strong><br />{finding.solution}</>}</p>)}</section>}
    {narrative && <section style={{ padding: "20px 0", whiteSpace: "pre-wrap" }}><strong>Description of work</strong><p>{narrative}</p></section>}
    {groups.map((group) => <section key={group.title} style={{ marginTop: 20 }}><h3 style={{ fontSize: 14 }}>{group.title}</h3>
      {title === "Invoice" ? <div style={{ overflowX: "auto" }}><table style={{ width: "100%", minWidth: 520, borderCollapse: "collapse", fontSize: 12 }}><thead><tr>{["Item", "Description", "Qty", "Unit price", "Amount"].map((heading) => <th key={heading} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e2e8f0" }}>{heading}</th>)}</tr></thead><tbody>{group.rows.map((row, i) => <tr key={i}>{[row.item ?? group.title, row.description, row.quantity ?? "", row.unitPrice === undefined ? "" : `$${row.unitPrice.toFixed(2)}`, `$${row.amount.toFixed(2)}`].map((value, j) => <td key={j} style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{value}</td>)}</tr>)}</tbody></table></div> : <div style={{ borderTop: "1px solid #e2e8f0" }}>{group.rows.map((row, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #e2e8f0", padding: "8px 0", fontSize: 13 }}><div>{row.description}{row.detail && <small style={{ display: "block", color: "#64748b" }}>{row.detail}</small>}</div><strong>${row.amount.toFixed(2)}</strong></div>)}</div>}
      <div style={{ textAlign: "right", padding: "8px 0", fontSize: 13, fontWeight: 700 }}>{group.title} subtotal: ${group.subtotal.toFixed(2)}</div></section>)}
    {sections.map((section) => <section key={section.title} style={{ marginTop: 20 }}><h3 style={{ fontSize: 14 }}>{section.title}</h3>
      <div style={{ borderTop: "1px solid #e2e8f0" }}>{section.lines.map((line, i) => <div key={i} style={{ borderBottom: "1px solid #e2e8f0", padding: "8px 0", fontSize: 13 }}>{line}</div>)}</div></section>)}
    {quoteSection && <section style={{ marginTop: 28 }}>
      <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>{quoteSection.heading}</h3>
      {quoteSection.groups.map((group) => <div key={group.title} style={{ marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>{group.title}</div>
        <div style={{ borderTop: "1px solid #e2e8f0" }}>{group.rows.map((row, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #e2e8f0", padding: "8px 0", fontSize: 13 }}><div>{row.description}{row.detail && <small style={{ display: "block", color: "#64748b" }}>{row.detail}</small>}</div><strong>${row.amount.toFixed(2)}</strong></div>)}</div>
      </div>)}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, border: `2px solid ${accent}`, borderRadius: 6, padding: 14, marginTop: 16, fontWeight: 800 }}><span>Quoted total</span><span>${quoteSection.total.toFixed(2)}</span></div>
    </section>}
    {total !== undefined && totalLabel && <div style={{ display: "flex", justifyContent: "space-between", gap: 12, border: `2px solid ${accent}`, borderRadius: 6, padding: 14, marginTop: 24, fontWeight: 800 }}><span>{totalLabel}</span><span>${total.toFixed(2)}</span></div>}
    {closing && <p style={{ whiteSpace: "pre-wrap", marginTop: 24 }}>{closing}</p>}
    {thankYou && <p style={{ whiteSpace: "pre-wrap", marginTop: 16 }}>{thankYou}</p>}
    {notices.length > 0 && <section aria-label="Terms and notices" style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid #e2e8f0", breakInside: "avoid-page" }}>
      <h3 style={{ fontSize: 13, color: "#334155", margin: "0 0 8px" }}>Terms &amp; notices</h3>
      {notices.map((notice) => <div key={notice.id} style={{ margin: "0 0 12px", ...(notice.statutory ? { border: "1px solid #94a3b8", padding: "10px 12px" } : {}) }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>{notice.title}</div>
        <div style={{ fontSize: 12, lineHeight: 1.55, color: "#475569", whiteSpace: "pre-wrap", ...(notice.statutory ? { fontWeight: 700 } : {}) }}>{notice.text}</div>
      </div>)}
    </section>}
    <footer style={{ marginTop: 32, borderTop: "1px solid #e2e8f0", paddingTop: 14, textAlign: "center", fontSize: 11, color: "#64748b" }}>{[brand.businessName, brand.licenseNumber, brand.websiteUrl].filter(Boolean).join(" · ")}</footer>
  </article>;
}
