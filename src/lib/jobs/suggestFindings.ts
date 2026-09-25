import { normalizeName } from "@/lib/format/name";
import type { Job } from "@/types/jobs";
import type { WorkCatalogItem } from "@/types/workCatalog";

// Words that appear in almost every catalog entry or field note and say nothing about WHICH problem it is.
const STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "are", "was", "were", "has", "have", "had", "into", "over", "not",
  "its", "but", "all", "any", "can", "one", "two", "out", "per", "also", "when", "then", "than", "near", "around",
  "roof", "roofing", "area", "areas", "section", "sections", "new", "old", "install", "installed", "replace", "replaced",
  "remove", "removed", "repair", "repaired", "check", "checked", "found", "some", "several", "will", "each", "every",
]);

/** Lowercase, diacritic-folded, lightly de-pluralised word set ("tiles" and "tile" match; "boots" and "boot" match). */
function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of normalizeName(text).split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOP.has(raw)) continue;
    const word = raw.length > 3 && raw.endsWith("s") && !raw.endsWith("ss") ? raw.slice(0, -1) : raw;
    if (!STOP.has(word)) out.add(word);
  }
  return out;
}

/**
 * Catalog items that look like the issues a technician reported (job.parsed.issues), best match first, at most 5.
 * Pure and deterministic — no LLM. A word in the catalog item's PROBLEM/CATEGORY counts double a word in its long
 * solution text, and a match needs a score of at least 2, so one shared filler word never produces a suggestion.
 * Items already on the job are excluded.
 */
export function suggestFindings(job: Job, catalog: WorkCatalogItem[]): WorkCatalogItem[] {
  const issues = job.parsed?.issues ?? [];
  if (issues.length === 0) return [];
  const issueTokens = new Set(issues.flatMap((issue) => [...tokens(issue.description), ...tokens(issue.resolution ?? "")]));
  if (issueTokens.size === 0) return [];
  const onJob = new Set((job.findings ?? []).flatMap((finding) => (finding.itemId ? [finding.itemId] : [])));

  return catalog
    .filter((item) => !onJob.has(item.itemId))
    .map((item) => {
      const strong = tokens(`${item.category} ${item.problem}`);
      const weak = tokens(item.solution);
      let score = 0;
      for (const word of issueTokens) {
        if (strong.has(word)) score += 2;
        else if (weak.has(word)) score += 1;
      }
      return { item, score };
    })
    .filter(({ score }) => score >= 2)
    .sort((a, b) => b.score - a.score || a.item.problem.localeCompare(b.item.problem))
    .slice(0, 5)
    .map(({ item }) => item);
}
