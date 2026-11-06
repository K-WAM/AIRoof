// Document look per business (BusinessConfig.documentStyle, 2026-11-06). "standard" is the original layout;
// "classic" is a traditional contractor letterhead modelled on the paper invoices, completion notices and proposals
// contractors already send (logo with address and license under it, title in the brand colour, boxed item table,
// Subtotal / Sales Tax / Total Due box, license and website in the footer). The decisions live here so the in-app
// preview, the print copy and the emails cannot drift apart.

export type DocumentStyle = "standard" | "classic";

export function documentStyleOf(business: { documentStyle?: unknown } | null | undefined): DocumentStyle {
  return business?.documentStyle === "classic" ? "classic" : "standard";
}

/** A deep letterhead red when the business has no brand colour of its own. */
export const CLASSIC_DEFAULT_COLOR = "#9f1239";

export function classicAccent(brandColor?: string | null): string {
  return /^#[0-9a-f]{6}$/i.test(brandColor ?? "") ? brandColor! : CLASSIC_DEFAULT_COLOR;
}

/** "11820 NW 41 Street, Coral Springs, FL 33065" → two lines (street, then city/state/zip); anything shorter stays one line. */
export function addressLines(address?: string | null): string[] {
  const text = (address ?? "").trim();
  if (!text) return [];
  if (text.includes("\n")) return text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const parts = text.split(",");
  if (parts.length < 3) return [text];
  return [parts[0].trim(), parts.slice(1).join(",").trim()];
}

/** "https://www.roofdoctors.cc/" → "www.roofdoctors.cc" (printed upper-case in the classic footer). */
export function displayWebsite(url?: string | null): string {
  return (url ?? "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/** Customer-facing group names: "Other" is an internal bucket; a contractor's invoice calls it services rendered. */
export function classicGroupTitle(title: string): string {
  return title === "Other" ? "Services Rendered" : title;
}

/** The kind of document a preview title names; drives which parts print in capitals (invoice and notice bodies). */
export type ClassicKind = "invoice" | "quote" | "report" | "notice";
export function classicKind(title: string): ClassicKind {
  const t = title.trim().toLowerCase();
  if (t === "invoice" || t === "deposit invoice") return "invoice";
  if (t === "quote" || t === "estimate") return "quote";
  if (t === "report") return "report";
  return "notice";
}
