// Deterministic stand-in for the field-note parser, used ONLY under the local smoke harness
// (isE2EHarness) so a browser/route test can push a note through the real pipeline with no OpenAI key.
// It understands the sentence shapes the smoke scenarios use:
//   "Used 12 bundles of shingles"  ->  materials
//   "Carlos worked 8 hours"        ->  labor
//   "found a cracked vent boot"    ->  issues (severity medium)
// Anything else lands in the timeline as one entry per sentence. Never used in production.
import type { ParsedUpdate } from "@/types/jobs";

const MATERIAL = /(\d+(?:\.\d+)?)\s+(bundles?|sheets?|rolls?|tubes?|boxes?|pieces?|tiles?|feet|ft)\s+(?:of\s+)?([a-z][a-z \-]*?)(?=\s*(?:,|\.|;|\band\b|$))/gi;
const LABOR = /([A-Z][a-z]+)\s+(?:worked|put in)\s+(\d+(?:\.\d+)?)\s+hours?/g;
const ISSUE = /\bfound\s+(?:an?\s+|some\s+)?([^,.;]+)/gi;

export function fixtureParseFieldUpdate(rawText: string, language?: string): ParsedUpdate {
  const text = rawText.trim();
  const parsed: ParsedUpdate = { timeline: [], materials: [], labor: [], issues: [], invoiceSuggestions: [], transcriptEn: text };
  if (language) parsed.sourceLanguage = language;

  for (const m of text.matchAll(MATERIAL)) {
    parsed.materials.push({ item: m[3].trim(), quantity: m[1], unit: m[2].toLowerCase() });
  }
  for (const m of text.matchAll(LABOR)) {
    parsed.labor.push({ description: `${m[1]} labor`, hours: Number(m[2]), source: "voice" });
  }
  for (const m of text.matchAll(ISSUE)) {
    parsed.issues.push({ description: m[1].trim(), severity: "medium" });
  }
  for (const sentence of text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)) {
    parsed.timeline.push({ description: sentence.replace(/[.!?]+$/, "") });
  }
  return parsed;
}
