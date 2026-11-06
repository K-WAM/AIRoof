import type { JobQuote } from "@/types/quote";
import type { LetterTemplate } from "@/types/documentTemplate";
import type { DocumentPhoto } from "./DocumentPreview";
import type { Letterhead } from "./letterhead";
import type { quoteLetter, LetterRate } from "./quoteLetter";
import { ClassicFooter, ClassicPhotos } from "./ClassicDocument";
import { LetterBody } from "./LetterBody";
import { addressLines, classicAccent } from "./documentStyle";
import { fmtDate } from "@/lib/format";
import { fmtMoney } from "@/lib/format/money";
import { fmtPhone } from "@/lib/format/phone";

export function ClassicQuoteLetter({ quote, brand, template, rates, photos, model, tm }: { quote: JobQuote; brand: Letterhead; template: LetterTemplate; rates: LetterRate[]; photos: DocumentPhoto[]; model: ReturnType<typeof quoteLetter>; tm: boolean }) {
  const accent = classicAccent(brand.brandColor);
  const tz = brand.timezone ?? "America/New_York";
  const companyLine = [brand.businessName, (brand.address ?? "").replace(/\s*\n\s*/g, ", "), brand.contactPhone ? `Phone ${fmtPhone(brand.contactPhone)}` : "", brand.fax ? `Fax ${fmtPhone(brand.fax)}` : ""].filter(Boolean).join(" • ");
  const serif = '"Times New Roman", Times, Georgia, serif';
  // Say it once: when the letter's own wording already states how long the price holds, the price line doesn't repeat it.
  const letterStatesValidity = model.letter.blocks.some((block) => block.paragraphs.some((p) => /\bvalid\b|in effect/i.test(p)));
  return <article className="k1-document k1-classic k1-classic-letter quote-doc" style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 4, padding: "clamp(16px, 4vw, 44px)", color: "#111827", fontFamily: serif, fontSize: 14, overflowWrap: "anywhere" }}>
    <header>
      {brand.tagline && <div style={{ textAlign: "center", color: accent, fontStyle: "italic", fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{brand.tagline}</div>}
      <div style={{ background: accent, color: "#fff", textAlign: "center", textTransform: "uppercase", fontFamily: "Arial, Helvetica, sans-serif", fontSize: 11, letterSpacing: "0.03em", padding: "5px 10px", lineHeight: 1.4 }}>{companyLine}</div>
      {brand.logoUrl
        // Library logos are data URIs, which next/image cannot optimize.
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={brand.logoUrl} alt={brand.businessName ?? ""} style={{ display: "block", width: "auto", maxWidth: 260, maxHeight: 110, margin: "14px 0 6px", ...brand.logoStyle }} />
        : <div style={{ fontSize: 22, fontWeight: 800, margin: "14px 0 6px" }}>{brand.businessName}</div>}
      {brand.licenseNumber && <div style={{ fontSize: 11 }}>STATE LICENSE #{brand.licenseNumber}</div>}
    </header>
    <p style={{ margin: "16px 0 12px" }}>{fmtDate(quote.createdAt, tz)}</p>
    <section style={{ display: "flex", flexWrap: "wrap", gap: "12px 32px", justifyContent: "space-between" }}>
      <div style={{ flex: "1 1 220px", minWidth: 0, lineHeight: 1.45 }}>
        <div>{quote.billTo.name}</div>
        {addressLines(quote.billTo.address).map((line, i) => <div key={i}>{line}</div>)}
        {quote.attention && <div><strong>Attn: {quote.attention}</strong></div>}
        {quote.billTo.email && <div>Email: {quote.billTo.email}</div>}
        {quote.billTo.phone && <div>Phone: {fmtPhone(quote.billTo.phone)}</div>}
      </div>
      <div style={{ flex: "1 1 220px", minWidth: 0, lineHeight: 1.45, fontWeight: 700, textAlign: "right" }}>
        {(quote.serviceAt ?? quote.billTo.address) && <div>{quote.serviceAt ?? quote.billTo.address}</div>}
        {quote.description && <div>RE: {quote.description}</div>}
        <div>WO# {quote.jobId}</div>
        <div style={{ fontWeight: 400, fontSize: 12, color: "#4b5563" }}>Quote {quote.quoteId}</div>
      </div>
    </section>
    <h2 style={{ textAlign: "center", fontStyle: "italic", fontWeight: 700, textDecoration: "underline", fontSize: 20, margin: "22px 0 10px" }}>{model.letter.title}</h2>
    {quote.narrative && <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{quote.narrative}</p>}
    <LetterBody letter={model.letter} classic />
    {tm ? <section style={{ margin: "14px 0" }}>
      <h3 style={{ fontSize: 15, fontStyle: "italic", fontWeight: 700, textDecoration: "underline", margin: "0 0 6px" }}>Labor rates</h3>
      <ul style={{ margin: "6px 0", paddingLeft: 28 }}>{rates.map((r, i) => <li key={i} style={{ marginBottom: 4 }}><strong><em>{r.role}</em></strong> @ {fmtMoney(r.rate)} per hr.</li>)}</ul>
      <p style={{ fontSize: 13 }}>Rates shown for reference; actual time is billed separately.</p>
    </section> : <>
      {model.scope.length > 0 && <section style={{ margin: "14px 0" }}><h3 style={{ fontSize: 15, fontStyle: "italic", fontWeight: 700, textDecoration: "underline", margin: "0 0 6px" }}>Scope of Work:</h3><ul style={{ paddingLeft: 28 }}>{model.scope.map((scope, i) => <li key={i} style={{ marginBottom: 6, lineHeight: 1.5 }}>{scope}</li>)}</ul></section>}
      <p style={{ lineHeight: 1.65 }}><strong style={{ fontStyle: "italic", textDecoration: "underline" }}>Price:</strong> <strong><em>{model.priceWords} ({fmtMoney(model.total)})</em></strong>.{letterStatesValidity ? "" : ` Valid for ${model.validDays} days.`}</p>
    </>}
    <section style={{ display: "flex", flexWrap: "wrap", gap: "20px 40px", marginTop: 36, breakInside: "avoid" }}>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ borderBottom: "1px solid #111827", height: 30 }} />
        <div style={{ display: "flex", gap: 60, marginTop: 4 }}><span>{tm ? "Authorized" : "Accepted"} by:</span><span>Date:</span></div>
        <div style={{ borderBottom: "1px solid #111827", height: 30, marginTop: 14 }} />
        <div style={{ marginTop: 4 }}>Printed name:</div>
      </div>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ borderBottom: "1px solid #111827", height: 30 }} />
        <div style={{ marginTop: 4 }}>{brand.businessName}</div>
        {template.signer?.name && <div><strong>{template.signer.name}</strong></div>}
        {template.signer?.title && <div>{template.signer.title}</div>}
      </div>
    </section>
    <ClassicPhotos photos={photos} />
    <ClassicFooter brand={brand} accent={accent} />
  </article>;
}
