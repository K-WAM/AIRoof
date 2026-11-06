import type { CSSProperties, ReactNode } from "react";
import type { DocumentPreviewProps, DocumentPhoto } from "./DocumentPreview";
import type { Letterhead } from "./letterhead";
import { photoPages } from "./photoPages";
import { fmtPhone } from "@/lib/format/phone";
import { fmtMoney } from "@/lib/format/money";
import { addressLines, classicAccent, classicGroupTitle, classicKind, displayWebsite } from "./documentStyle";

// The "classic" letterhead (BusinessConfig.documentStyle, src/lib/documents/documentStyle.ts): what a contractor's
// own paper invoice, completion notice and proposal look like. Same props and the same class names as the standard
// DocumentPreview (`k1-document`, `.invoice-doc`/`.quote-doc`/`.report-doc`, `.document-finding`, `header img`) so
// print rules, photo pages and every existing check keep working. Every value is plain React text: nothing is ever
// injected as HTML.

const INK = "#111827";
const MUTED = "#374151";
const RULE = "#111827";
const LABEL_BLUE = "#1d4ed8";

/** Logo, address, phone/fax and license — the left half of the form header and the top of a letter. */
export function ClassicFrom({ brand, align = "left" }: { brand: Letterhead; align?: "left" | "center" }) {
  const lines = addressLines(brand.address);
  const phone = brand.contactPhone ? `Phone: ${fmtPhone(brand.contactPhone)}` : "";
  const fax = brand.fax ? `Fax: ${fmtPhone(brand.fax)}` : "";
  return <div className="k1-classic-from" style={{ textAlign: align, minWidth: 0 }}>
    {brand.logoUrl
      // Library logos are data URIs, which next/image cannot optimize.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={brand.logoUrl} alt={brand.businessName ?? ""} style={{ display: "block", width: "auto", maxWidth: 230, maxHeight: 96, margin: align === "center" ? "0 auto 6px" : "0 0 6px", ...brand.logoStyle }} />
      : <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{brand.businessName}</div>}
    <div style={{ fontSize: 11, lineHeight: 1.4, color: INK, textTransform: "uppercase", letterSpacing: "0.01em" }}>
      {lines.map((line, i) => <div key={i}>{line}</div>)}
      {(phone || fax) && <div style={{ textTransform: "none" }}>{[phone, fax].filter(Boolean).join("  ")}</div>}
      {brand.licenseNumber && <div>State license #{brand.licenseNumber}</div>}
    </div>
  </div>;
}

/** License left, website right — the classic footer on every page's end. */
export function ClassicFooter({ brand, accent }: { brand: Letterhead; accent: string }) {
  const site = displayWebsite(brand.websiteUrl);
  if (!brand.licenseNumber && !site) return null;
  return <footer className="k1-classic-footer" style={{ marginTop: 36, paddingTop: 10, borderTop: "1px solid #d1d5db", display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", fontSize: 11, color: MUTED }}>
    <span>{brand.licenseNumber ? `LIC# ${brand.licenseNumber}` : ""}</span>
    {site && <span style={{ color: accent, textTransform: "uppercase", textDecoration: "underline", letterSpacing: "0.02em" }}>{site}</span>}
  </footer>;
}

function MetaGrid({ meta, accent, kind }: { meta: [string, string][]; accent: string; kind: string }) {
  void accent;
  return <dl className="k1-classic-meta" style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: "3px 12px", margin: "10px 0 0", fontSize: 12, alignItems: "baseline" }}>
    {meta.map(([key, value], index) => {
      const label = kind === "invoice" && key === "Number" ? "Invoice No." : key;
      return <div key={key} style={{ display: "contents" }}>
        {/* Date and number labels in blue, the rest in ink — like a printed contractor invoice. */}
        <dt style={{ fontWeight: 700, color: index < 2 ? LABEL_BLUE : INK, whiteSpace: "nowrap" }}>{label}: </dt>
        <dd style={{ margin: 0, color: INK, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{value}</dd>
      </div>;
    })}
  </dl>;
}

const caps: CSSProperties = { textTransform: "uppercase", letterSpacing: "0.01em" };

export function ClassicDocument({ title, brand, meta, billTo, partyLabel = "Bill to", opening, narrative, findings, findingSections, closing, thankYou, groups = [], sections = [], quoteSection, notices = [], totalLabel, total, totals, photos = [], className = "", howToPay, afterHowToPay, children, serviceAt, customerCode, depositsApplied }: DocumentPreviewProps) {
  const accent = classicAccent(brand.brandColor);
  const kind = classicKind(title);
  const capsBody = kind === "invoice" || kind === "notice";
  // "Service at" prints once: in the details grid when the page put it there, otherwise beside the customer.
  const metaHasServiceAt = meta.some(([key]) => key.toLowerCase() === "service at");
  const showTable = kind === "invoice" || kind === "quote";
  const hasTotalsBox = total !== undefined && !!totalLabel;
  return <article className={`k1-document k1-classic ${className}`} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 4, padding: "clamp(16px, 4vw, 44px)", color: INK, fontFamily: "Arial, Helvetica, sans-serif", overflowWrap: "anywhere" }}>
    <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 20, alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}><ClassicFrom brand={brand} /></div>
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <h2 style={kind === "invoice" || kind === "quote"
          ? { margin: 0, paddingBottom: 4, borderBottom: `2px solid ${RULE}`, fontSize: 32, fontWeight: 500, color: accent, letterSpacing: "0.01em" }
          : { margin: 0, paddingBottom: 4, borderBottom: `2px solid ${RULE}`, fontSize: 24, fontWeight: 800, fontStyle: "italic", textTransform: "uppercase", color: accent, letterSpacing: "0.02em", lineHeight: 1.15 }}>{title}</h2>
        <MetaGrid meta={meta} accent={accent} kind={kind} />
      </div>
    </header>
    <section className="k1-classic-parties" style={{ display: "flex", flexWrap: "wrap", gap: "12px 24px", marginTop: 18, fontSize: 13 }}>
      <div style={{ flex: "1 1 240px", minWidth: 0, display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: "6px 14px", alignItems: "baseline" }}>
        {customerCode && <><strong>Customer ID:</strong><span>{customerCode}</span></>}
        <strong>{partyLabel}:</strong>
        <span style={{ textTransform: "uppercase" }}>{billTo.name}{billTo.address && <><br />{billTo.address}</>}{billTo.phone && <><br />{fmtPhone(billTo.phone)}</>}</span>
      </div>
      {serviceAt !== undefined && !metaHasServiceAt && <div style={{ flex: "1 1 240px", minWidth: 0, display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: "6px 14px", alignItems: "baseline" }}>
        <strong>Service at:</strong><span style={{ textTransform: "uppercase" }}>{serviceAt}</span>
      </div>}
    </section>
    <hr style={{ border: 0, borderTop: `3px double ${RULE}`, margin: "18px 0 6px" }} />
    {opening && <p style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.6, margin: "14px 0", ...(capsBody ? caps : {}) }}>{opening}</p>}
    {children && <div className="k1-classic-body" style={{ fontSize: 13, lineHeight: 1.6, ...(kind === "notice" ? caps : {}) }}>{children}</div>}
    {findingSections ? findings?.map((finding, index) => <section key={index} className="document-finding" style={{ padding: "10px 0", whiteSpace: "pre-wrap", fontSize: 13 }}><h3 style={{ fontSize: 13, margin: "0 0 4px", textTransform: "uppercase", textDecoration: "underline" }}>{finding.category || `Finding ${index + 1}`}</h3><p style={{ margin: "2px 0" }}><strong>Problem:</strong> {finding.problem}</p><p style={{ margin: "2px 0" }}><strong>Corrective Action:</strong> {finding.solution}</p>{finding.note?.trim() && <p style={{ margin: "2px 0" }}><em>Inspector&apos;s note: {finding.note.trim()}</em></p>}</section>) : !!findings?.length && <section style={{ padding: "10px 0", fontSize: 13 }}><strong>{kind === "invoice" ? "Findings and corrective action" : "Issues found & work recommended"}</strong>{findings.map((finding, index) => <p key={index} style={{ whiteSpace: "pre-wrap" }}>{kind === "invoice" ? <><strong>Problem:</strong> {finding.problem}<br /><strong>Corrective action:</strong> {finding.solution}</> : <><strong>{finding.problem}</strong><br />{finding.solution}</>}{finding.note?.trim() && <><br /><em>Inspector&apos;s note: {finding.note.trim()}</em></>}</p>)}</section>}
    {narrative && <section style={{ padding: "10px 0", whiteSpace: "pre-wrap", fontSize: 13 }}><strong>Description of work</strong><p style={{ margin: "4px 0" }}>{narrative}</p></section>}
    {groups.length > 0 && (showTable ? <div style={{ overflowX: "auto", marginTop: 14 }}>
      <table className="k1-classic-items" style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: "clamp(10px, 1.2vw, 12px)" }}>
        <colgroup>{[18, 28, 14, 20, 20].map((width, i) => <col key={i} style={{ width: `${width}%` }} />)}</colgroup>
        <thead><tr>{["Item", "Description", "Quantity", "Unit Price", "Amount"].map((heading, i) => <th key={heading} style={{ textAlign: i >= 2 ? "right" : "left", padding: "4px clamp(2px, .6vw, 8px)", border: `1px solid ${RULE}`, borderLeftWidth: i === 0 ? 1 : 0, borderRightWidth: i === 4 ? 1 : 0, fontWeight: 700, background: "#fff" }}>{heading}</th>)}</tr></thead>
        <tbody>
          {groups.map((group) => {
            const groupName = classicGroupTitle(group.title);
            return [
              ...group.rows.map((row, i) => <tr key={`${group.title}-${i}`}>
                <td style={{ padding: "5px clamp(2px, .6vw, 8px)", verticalAlign: "top", fontWeight: i === 0 ? 700 : 400 }}>{i === 0 && group.title !== "Project price" ? groupName : ""}</td>
                <td style={{ padding: "5px clamp(2px, .6vw, 8px)", verticalAlign: "top" }}>{row.item && row.item !== group.title && row.item !== "Labor" && row.item !== "Other" ? <>{row.item}{row.description && row.description !== "Material" ? <><br /><span style={{ color: MUTED }}>{row.description}</span></> : null}</> : row.description}{row.detail && <span style={{ display: "block", color: MUTED }}>{row.detail}</span>}</td>
                <td style={{ padding: "5px clamp(2px, .6vw, 8px)", textAlign: "right", verticalAlign: "top" }}>{row.quantity !== undefined ? row.quantity.toFixed(2) : ""}</td>
                <td style={{ padding: "5px clamp(2px, .6vw, 8px)", textAlign: "right", verticalAlign: "top" }}>{row.unitPrice !== undefined ? fmtMoney(row.unitPrice) : ""}</td>
                <td style={{ padding: "5px clamp(2px, .6vw, 8px)", textAlign: "right", verticalAlign: "top" }}>{fmtMoney(row.amount)}</td>
              </tr>),
              group.title !== "Project price" ? <tr key={`${group.title}-subtotal`}>
                <td colSpan={3} style={{ padding: "3px clamp(2px, .6vw, 8px) 10px", textAlign: "right", fontWeight: 700 }}>{groupName}</td>
                <td style={{ padding: "3px clamp(2px, .6vw, 8px) 10px", textAlign: "right", fontWeight: 700, borderTop: `1px solid ${RULE}` }}>Subtotal</td>
                <td style={{ padding: "3px clamp(2px, .6vw, 8px) 10px", textAlign: "right", fontWeight: 700, borderTop: `1px solid ${RULE}` }}>{fmtMoney(group.subtotal)}</td>
              </tr> : null,
            ];
          })}
        </tbody>
      </table>
    </div> : groups.map((group) => <section key={group.title} style={{ marginTop: 14, fontSize: 13 }}>{group.title !== "Project price" && <h3 style={{ fontSize: 13, margin: "0 0 4px" }}>{classicGroupTitle(group.title)}</h3>}
      {group.rows.map((row, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0", borderBottom: "1px solid #e5e7eb" }}><div>{row.description}{row.detail && <small style={{ display: "block", color: MUTED }}>{row.detail}</small>}</div><strong>{fmtMoney(row.amount)}</strong></div>)}
    </section>))}
    {sections.map((section) => <section key={section.title} style={{ marginTop: 16, fontSize: 13 }}><h3 style={{ fontSize: 13, margin: "0 0 4px", textTransform: "uppercase", textDecoration: "underline" }}>{section.title}</h3>
      {section.lines.map((line, i) => <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid #e5e7eb" }}>{line}</div>)}</section>)}
    {quoteSection && <section style={{ marginTop: 20, fontSize: 13 }}>
      <h3 style={{ fontSize: 14, margin: "0 0 4px" }}>{quoteSection.heading}</h3>
      {quoteSection.groups.map((group) => <div key={group.title} style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 700 }}>{classicGroupTitle(group.title)}</div>
        {group.rows.map((row, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0", borderBottom: "1px solid #e5e7eb" }}><div>{row.description}{row.detail && <small style={{ display: "block", color: MUTED }}>{row.detail}</small>}</div><strong>{fmtMoney(row.amount)}</strong></div>)}
      </div>)}
      <TotalsBox rows={[["Quoted total", fmtMoney(quoteSection.total)]]} />
    </section>}
    {hasTotalsBox && <TotalsBox rows={[
      ...(totals ? [["Subtotal", fmtMoney(totals.subtotal)], ["Sales Tax", fmtMoney(totals.tax)]] as [string, string][] : []),
      ...(depositsApplied ?? []).map((deposit) => [`Less deposit (${deposit.invoiceId})`, `−${fmtMoney(deposit.amount)}`] as [string, string]),
      [totalLabel!, fmtMoney(total!)],
    ]} />}
    {!!depositsApplied?.length && <p style={{ fontSize: 11, color: MUTED, textAlign: "right", margin: "4px 0 0" }}>Tax is calculated on work; deposits are deducted after tax.</p>}
    {howToPay && (howToPay.instructions || howToPay.link) && <section data-testid="how-to-pay" style={{ marginTop: 16, padding: "10px 12px", border: `1px solid ${RULE}`, breakInside: "avoid", fontSize: 13 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>How to pay</div>
      {howToPay.instructions && <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{howToPay.instructions}</div>}
      {howToPay.link && <div style={{ marginTop: 4 }}>Pay online: <a href={howToPay.link} style={{ color: accent }}>{howToPay.link}</a></div>}
    </section>}
    {afterHowToPay}
    {closing && <p style={{ whiteSpace: "pre-wrap", marginTop: 20, fontSize: 13, lineHeight: 1.6, ...(capsBody ? caps : {}) }}>{closing}</p>}
    {thankYou && <p style={{ whiteSpace: "pre-wrap", marginTop: 12, fontSize: 13, lineHeight: 1.6, ...(capsBody ? caps : {}) }}>{thankYou}</p>}
    {notices.length > 0 && <section aria-label="Terms and notices" style={{ marginTop: 24, paddingTop: 12, borderTop: "1px solid #d1d5db", breakInside: "avoid-page" }}>
      <h3 style={{ fontSize: 12, margin: "0 0 8px", textTransform: "uppercase" }}>Terms &amp; notices</h3>
      {notices.map((notice) => <div key={notice.id} style={{ margin: "0 0 10px", ...(notice.statutory ? { border: `1px solid ${RULE}`, padding: "8px 10px" } : {}) }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{notice.title}</div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: MUTED, whiteSpace: "pre-wrap", ...(notice.statutory ? { fontWeight: 700 } : {}) }}>{notice.text}</div>
      </div>)}
    </section>}
    <ClassicPhotos photos={photos} />
    <ClassicFooter brand={brand} accent={accent} />
  </article>;
}

/** Subtotal / Sales Tax / Total Due — the boxed grid at the bottom right of a contractor invoice. */
function TotalsBox({ rows }: { rows: [string, string][] }) {
  return <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
    <table className="k1-classic-totals" style={{ borderCollapse: "collapse", fontSize: 13, minWidth: 240, breakInside: "avoid" }}>
      <tbody>{rows.map(([label, value], i) => {
        const last = i === rows.length - 1;
        return <tr key={label}>
          <th scope="row" style={{ textAlign: "left", padding: "5px 10px", border: "1px solid #111827", fontWeight: 700, fontSize: last ? 14 : 13 }}>{label}:</th>
          <td style={{ textAlign: "right", padding: "5px 10px", border: "1px solid #111827", fontWeight: last ? 800 : 400, fontSize: last ? 14 : 13, whiteSpace: "nowrap" }}>{value}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

export function ClassicPhotos({ photos }: { photos: DocumentPhoto[] }) {
  return <>{photoPages(photos).map((page, pageIndex) => <section key={pageIndex} className="document-photo-page" style={{ marginTop: 24, ...(pageIndex ? { breakBefore: "page", pageBreakBefore: "always" } : {}) }}>
    <h3 style={{ fontSize: 13, textTransform: "uppercase", textDecoration: "underline" }}>Photo documentation</h3>{page.rows.map((row, rowIndex) => <div key={rowIndex} className="document-photo-row" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, breakInside: "avoid", pageBreakInside: "avoid", marginTop: 10 }}><ClassicPhoto title={row.before?.phase === "before" ? "Before" : "Photo"} photo={row.before as DocumentPhoto | undefined} /><ClassicPhoto title={row.after?.phase === "after" ? "After" : "Photo"} photo={row.after as DocumentPhoto | undefined} /></div>)}
  </section>)}</>;
}

function ClassicPhoto({ title, photo }: { title: string; photo?: DocumentPhoto }): ReactNode {
  if (!photo) return <div aria-label={`${title}: no photo recorded`} style={{ minHeight: 80 }} />;
  const src = photo.src ?? (photo.fullB64 ? `data:image/jpeg;base64,${photo.fullB64}` : `data:image/jpeg;base64,${photo.thumbB64}`);
  return <figure style={{ margin: 0 }}>
    <strong style={{ fontSize: 11, textTransform: "uppercase" }}>{title}</strong>
    {/* Full-resolution document photos are data URIs and cannot use next/image. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt={photo.label} style={{ display: "block", width: "100%", maxHeight: 300, objectFit: "contain", marginTop: 4, border: "1px solid #d1d5db" }} />
    <figcaption style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>{photo.label}</figcaption>
  </figure>;
}
