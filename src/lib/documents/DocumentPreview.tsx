import type { DocumentGroup } from "./groups";
import type { Letterhead } from "./letterhead";

export function DocumentPreview({ title, brand, meta, billTo, narrative, groups, totalLabel, total, className = "" }: {
  title: string; brand: Letterhead; meta: [string, string][];
  billTo: { name: string; address?: string; phone?: string }; narrative?: string;
  groups: DocumentGroup[]; totalLabel: string; total: number; className?: string;
}) {
  const accent = /^#[0-9a-f]{6}$/i.test(brand.brandColor ?? "") ? brand.brandColor! : "var(--accent)";
  return <article className={className} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "clamp(16px, 4vw, 44px)", color: "#1e293b", overflowWrap: "anywhere" }}>
    <header style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 24, borderBottom: `3px solid ${accent}`, paddingBottom: 20 }}>
      <div>{brand.logoUrl && <img src={brand.logoUrl} alt={brand.businessName ?? ""} style={{ width: "auto", maxWidth: 140, maxHeight: 54, ...brand.logoStyle }} />}
        <div style={{ fontSize: 19, fontWeight: 800 }}>{brand.businessName}</div>
        {[brand.address, brand.contactPhone, brand.contactEmail, brand.licenseNumber].filter(Boolean).map((line, i) => <div key={i} style={{ fontSize: 12, color: "#475569" }}>{line}</div>)}
      </div>
      <div><h2 style={{ margin: "0 0 8px", fontSize: 28, color: accent }}>{title}</h2>{meta.map(([key, value]) => <div key={key} style={{ fontSize: 12 }}><strong>{key}:</strong> {value}</div>)}</div>
    </header>
    <section style={{ padding: "20px 0", borderBottom: "1px solid #e2e8f0" }}><strong>Bill to</strong><div>{billTo.name}</div>{billTo.address && <div>{billTo.address}</div>}{billTo.phone && <div>{billTo.phone}</div>}</section>
    {narrative && <section style={{ padding: "20px 0", whiteSpace: "pre-wrap" }}><strong>Description of work</strong><p>{narrative}</p></section>}
    {groups.map((group) => <section key={group.title} style={{ marginTop: 20 }}><h3 style={{ fontSize: 14 }}>{group.title}</h3>
      <div style={{ borderTop: "1px solid #e2e8f0" }}>{group.rows.map((row, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #e2e8f0", padding: "8px 0", fontSize: 13 }}><div>{row.description}{row.detail && <small style={{ display: "block", color: "#64748b" }}>{row.detail}</small>}</div><strong>${row.amount.toFixed(2)}</strong></div>)}</div>
      <div style={{ textAlign: "right", padding: "8px 0", fontSize: 13, fontWeight: 700 }}>{group.title} subtotal: ${group.subtotal.toFixed(2)}</div></section>)}
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, border: `2px solid ${accent}`, borderRadius: 6, padding: 14, marginTop: 24, fontWeight: 800 }}><span>{totalLabel}</span><span>${total.toFixed(2)}</span></div>
    <footer style={{ marginTop: 32, borderTop: "1px solid #e2e8f0", paddingTop: 14, textAlign: "center", fontSize: 11, color: "#64748b" }}>{[brand.businessName, brand.licenseNumber, brand.websiteUrl].filter(Boolean).join(" · ")}</footer>
  </article>;
}
