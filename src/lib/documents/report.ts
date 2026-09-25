import type { DocumentOptions } from "@/types/documentOptions";
import { normalizeDocumentOptions } from "@/types/documentOptions";
import type { ParsedUpdate, PhotoPhase } from "@/types/jobs";
import type { DocumentGroup } from "./groups";

export type ReportPhoto = { label: string; fullB64: string; phase?: PhotoPhase };
export type ReportPhotoPair = { before?: ReportPhoto; after?: ReportPhoto };

/** A customer-copy report section: plain facts, never prices. A report says what was found and done, not what it cost. */
export type ReportSection = { title: "Labor" | "Materials"; lines: string[] };

/**
 * Report sections for the customer copy. Deliberately carries NO rates, costs or totals — pricing lives on the quote and
 * invoice only. "Hide materials" / "Hide labor details" omit the whole section.
 */
export function reportSections(parsed: ParsedUpdate | undefined, options?: Partial<DocumentOptions>): ReportSection[] {
  const flags = normalizeDocumentOptions(options);
  const labor = parsed?.labor ?? [];
  const materials = parsed?.materials ?? [];
  const laborLines = labor.map((line) => `${line.description}${line.hours ? ` — ${line.hours} h` : ""}`);
  const materialLines = materials.map((line) => `${line.item}${line.quantity ? ` — ${line.quantity}${line.unit ? ` ${line.unit}` : ""}` : ""}`);
  return [
    { title: "Labor" as const, lines: flags.hideLabor ? [] : laborLines },
    { title: "Materials" as const, lines: flags.hideMaterials ? [] : materialLines },
  ].filter((section) => section.lines.length);
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
