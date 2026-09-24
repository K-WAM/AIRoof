import type { JobFinding } from "@/types/workCatalog";
import type { JobQuote, QuoteLine, QuoteStatus } from "@/types/quote";
import { validLine } from "@/lib/jobs/findings";

const plain = (s: unknown, max: number) => typeof s === "string" && s.length <= max && !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s);
export function quoteLinesFromFindings(findings: JobFinding[]): QuoteLine[] {
  return findings.filter((f) => f.includeInQuote).flatMap((f) => (f.lines ?? []).map((line, i) => ({
    ...line, lineId: `finding_${f.findingId}_${i}`, findingId: f.findingId,
  })));
}
export function quoteTotal(lines: QuoteLine[]): number {
  return Math.round(lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) * 100) / 100;
}
export function validQuoteLines(lines: unknown): lines is QuoteLine[] {
  return Array.isArray(lines) && lines.length <= 200 && lines.every((value) => {
    if (!value || typeof value !== "object") return false;
    const line = value as QuoteLine;
    if (!Object.keys(line).every((key) => ["lineId", "findingId", "description", "quantity", "unit", "unitPrice", "kind"].includes(key))) return false;
    if (!validLine({ description: line.description, quantity: line.quantity, unit: line.unit, unitPrice: line.unitPrice, kind: line.kind })) return false;
    return plain(line.lineId, 120) && !!line.lineId && (line.findingId === undefined || plain(line.findingId, 100));
  }) &&
    new Set(lines.map((line: QuoteLine) => line.lineId)).size === lines.length;
}
export function nextQuoteStatus(current: QuoteStatus, next: QuoteStatus): boolean {
  return current === "sent" && ["accepted", "declined", "expired"].includes(next);
}
export function visibleQuoteLines(quote: JobQuote): QuoteLine[] {
  if (!quote.hideMaterials) return quote.lines;
  const materials = quote.lines.filter((line) => line.kind === "material");
  return [
    ...quote.lines.filter((line) => line.kind !== "material"),
    ...(materials.length ? [{ lineId: "materials-summary", kind: "material" as const,
      description: "Materials & supplies", quantity: 1, unitPrice: quoteTotal(materials) }] : []),
  ];
}
