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

const ARRIVAL_OR_DEPARTURE = /\b(arriv|left|leav|depart|on site|on-site)/i;

/**
 * Deterministic (no LLM) first draft of the report's Scope & Resolution notes, so the admin reviews and edits instead
 * of writing from scratch. Facts only, NEVER prices (reports carry none). It respects the customer-copy options —
 * with "Hide labor details" on it does not name who was on site or for how long, and with "Hide materials" on it lists
 * no materials — because these notes print on the customer's copy.
 * Returns "" when there is nothing recorded yet.
 */
export function draftReportNotes(
  job: { serviceType?: string; address?: string; parsed?: ParsedUpdate },
  options?: Partial<DocumentOptions>,
): string {
  const parsed = job.parsed;
  if (!parsed) return "";
  const parts: string[] = [];

  const service = job.serviceType?.trim();
  if (service) parts.push(`Service: ${service}${job.address?.trim() ? ` at ${job.address.trim()}` : ""}.`);

  const issues = parsed.issues.map((issue) => issue.description.trim()).filter(Boolean);
  if (issues.length) parts.push(`Issues identified: ${issues.join("; ")}.`);

  // Arrival/departure lines repeat the site-visit sentence (and would name the crew even when labor is hidden).
  const work = parsed.timeline.map((entry) => entry.description.trim()).filter((text) => text && !ARRIVAL_OR_DEPARTURE.test(text));
  if (work.length) parts.push(`Work notes: ${work.join("; ")}.`);

  return stripHiddenFacts(parts.join(" "), options);
}

/** One generated detail sentence: from its label to the first period that ends a sentence (decimals like "0.5 in" don't). */
const generatedSentence = (labels: string) => new RegExp(`(^|\\s)(?:${labels}):.*?\\.(?=\\s+[A-Z]|\\s*$)`, "gis");
const LABOR_SENTENCE = generatedSentence("Site visit|Labor recorded");
const MATERIALS_SENTENCE = generatedSentence("Materials used");

/**
 * The report's "Description of work" is saved text, so hiding labor or materials on the customer copy must also remove the
 * detail sentences an earlier draft wrote into it ("Site visit: Kevin.", "Materials used: ladders (6 pieces)."). Only those
 * generated sentences are removed — everything else the office wrote is left exactly as typed, paragraph breaks included.
 * Returns the notes untouched when nothing is hidden.
 */
export function stripHiddenFacts(notes: string, options?: Partial<DocumentOptions>): string {
  const flags = normalizeDocumentOptions(options);
  if (!flags.hideLabor && !flags.hideMaterials) return notes;
  let result = notes;
  if (flags.hideLabor) result = result.replace(LABOR_SENTENCE, "$1");
  if (flags.hideMaterials) result = result.replace(MATERIALS_SENTENCE, "$1");
  // A removed sentence that filled its own line leaves an empty one behind: tidy the spaces and any stack of blank lines.
  return result.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
