import type { DocumentOptions } from "@/types/documentOptions";
import { normalizeDocumentOptions } from "@/types/documentOptions";
import type { ParsedUpdate, PhotoPhase } from "@/types/jobs";
import type { DocumentGroup } from "./groups";

export type ReportPhoto = { label: string; fullB64: string; phase?: PhotoPhase };
export type ReportPhotoPair = { before?: ReportPhoto; after?: ReportPhoto };

const roundMoney = (value: number) => Math.round(value * 100) / 100;

/** Customer-copy cost rows for a report. Totals always retain the complete projection cost. */
export function reportGroups(parsed: ParsedUpdate | undefined, defaultRate: number, options?: Partial<DocumentOptions>): DocumentGroup[] {
  const flags = normalizeDocumentOptions(options);
  const labor = parsed?.labor ?? [];
  const materials = parsed?.materials ?? [];
  const laborRows = labor.map((line) => {
    const hours = line.hours ?? 0;
    const rate = line.rate ?? defaultRate;
    return { description: line.description, detail: `${hours} hours × $${rate.toFixed(2)}`, amount: roundMoney(hours * rate) };
  });
  const materialRows = materials.map((line) => ({
    description: line.item,
    detail: `${line.quantity ?? ""}${line.unit ? ` ${line.unit}` : ""}${line.cost != null ? ` × $${line.cost.toFixed(2)}` : ""}`.trim(),
    amount: roundMoney(line.cost ?? 0),
  }));
  const laborSubtotal = laborRows.reduce((sum, row) => sum + row.amount, 0);
  const materialSubtotal = materialRows.reduce((sum, row) => sum + row.amount, 0);
  return [
    { title: "Labor" as const, rows: flags.hideLabor && laborRows.length ? [{ description: "Labor", amount: laborSubtotal }] : laborRows, subtotal: laborSubtotal },
    { title: "Materials" as const, rows: flags.hideMaterials && materialRows.length ? [{ description: "Materials", amount: materialSubtotal }] : materialRows, subtotal: materialSubtotal },
  ].filter((group) => group.rows.length);
}

export function reportTotal(groups: DocumentGroup[]): number {
  return roundMoney(groups.reduce((sum, group) => sum + group.subtotal, 0));
}

/** Deterministic draft; it deliberately uses only facts already recorded on the job. */
export function draftNarrative(parsed: ParsedUpdate | undefined): string {
  if (!parsed) return "";
  const parts: string[] = [];
  if (parsed.issues.length) parts.push(`Issues identified: ${parsed.issues.map((issue) => issue.description).join("; ")}.`);
  if (parsed.timeline.length) parts.push(`Work completed: ${parsed.timeline.map((entry) => entry.description).join("; ")}.`);
  if (parsed.materials.length) parts.push(`Materials used: ${parsed.materials.map((material) => material.item).join(", ")}.`);
  if (parsed.labor.length) parts.push(`Labor recorded: ${parsed.labor.map((entry) => entry.description).join("; ")}.`);
  return parts.join(" ");
}

/** Existing before/after photo metadata becomes customer-facing Problem/Corrective action sections. */
export function pairReportPhotos(photos: ReportPhoto[]): { pairs: ReportPhotoPair[]; other: ReportPhoto[] } {
  const before = photos.filter((photo) => photo.phase === "before");
  const after = photos.filter((photo) => photo.phase === "after");
  const other = photos.filter((photo) => !photo.phase || photo.phase === "other");
  return { pairs: Array.from({ length: Math.max(before.length, after.length) }, (_, index) => ({ before: before[index], after: after[index] })), other };
}
