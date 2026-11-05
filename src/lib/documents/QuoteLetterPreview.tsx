import type { JobQuote } from "@/types/quote";
import type { LetterTemplate } from "@/types/documentTemplate";
import type { DocumentPhoto } from "./DocumentPreview";
import { DocumentPreview } from "./DocumentPreview";
import { LetterBody } from "./LetterBody";
import { quoteLetter, type LetterRate } from "./quoteLetter";
import type { Letterhead } from "./letterhead";
import { fmtDate } from "@/lib/format";
import { fmtMoney } from "@/lib/format/money";

export function QuoteLetterPreview({ quote, brand, template, rates, photos }: { quote: JobQuote; brand: Letterhead; template: LetterTemplate; rates: LetterRate[]; photos: DocumentPhoto[] }) {
  const model = quoteLetter(quote, brand, template, rates);
  const tm = quote.layout === "tm_authorization";
  return <><div className="no-print">{model.letter.missing.length > 0 && <p role="status">Unfilled letter fields: {model.letter.missing.join(", ")}</p>}</div><DocumentPreview className="quote-doc" title={model.letter.title} brand={brand}
    meta={[["Date", fmtDate(quote.createdAt, brand.timezone ?? "America/New_York")], ["Quote", quote.quoteId + " · Job " + quote.jobId]]} billTo={quote.billTo} photos={photos}>
    {quote.attention && <p>Attention: {quote.attention}</p>}
    <p><strong>RE:</strong> {[quote.serviceAt ?? quote.billTo.address, quote.description, `Work order ${quote.jobId}`].filter(Boolean).join(" · ")}</p>
    {quote.narrative && <p style={{ whiteSpace: "pre-wrap" }}>{quote.narrative}</p>}
    <LetterBody letter={model.letter} />
    {tm ? <section><h3>Labor rates</h3><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th style={{ textAlign: "left" }}>Role</th><th style={{ textAlign: "right" }}>Hourly rate</th></tr></thead><tbody>{rates.map((r, i) => <tr key={i}><td style={{ padding: "10px 0" }}>{r.role}</td><td style={{ textAlign: "right" }}>{fmtMoney(r.rate)}</td></tr>)}</tbody></table><p>Rates shown for reference; actual time is billed separately.</p></section>
      : <>{model.scope.length > 0 && <><h3>Scope of work</h3><ul>{model.scope.map((scope, i) => <li key={i} style={{ marginBottom: 8 }}>{scope}</li>)}</ul></>}<p><strong>Price: {fmtMoney(model.total)}</strong><br />{model.priceWords}</p><p>Valid for {model.validDays} days.</p></>}
    <section style={{ borderTop: "1px solid #cbd5e1", marginTop: 32, paddingTop: 20 }}><p>{tm ? "Authorized" : "Accepted"} by: ____________________</p><p>Date: ____________________</p><p>Printed name: ____________________</p>{template.signer?.name && <p>{template.signer.name}<br />{template.signer.title}</p>}</section>
  </DocumentPreview></>;
}
