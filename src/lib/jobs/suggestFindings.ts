import { normalizeName } from "@/lib/format/name";
import type { Job } from "@/types/jobs";
import type { WorkCatalogItem } from "@/types/workCatalog";

// Words that appear in almost every catalog entry or field note and say nothing about WHICH problem it is.
const STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "are", "was", "were", "has", "have", "had", "into", "over", "not",
  "its", "but", "all", "any", "can", "one", "two", "out", "per", "also", "when", "then", "than", "near", "around",
  "roof", "roofing", "area", "areas", "section", "sections", "new", "old", "install", "installed", "replace", "replaced",
  "remove", "removed", "repair", "repaired", "check", "checked", "found", "some", "several", "will", "each", "every",
  // CONDITION words describe how bad something is, not WHAT it is. Matching on them suggested a cracked skylight lens for
  // "six cracked tiles" in the owner's demo. The nouns (tile, boot, skylight, gutter…) must carry the match.
  "crack", "cracked", "cracking", "split", "broken", "break", "damage", "damaged", "loose", "missing", "leak", "leaks", "leaking",
  "water", "worn", "wear", "bad", "torn", "rusted", "rust", "failed", "failing", "issue", "problem", "south", "north", "east", "west",
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
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
 * Pure and deterministic — no LLM.
 *
 * GATE: an item is only ever suggested if a word from what the tech DESCRIBED (the issue text) appears in the item's own
 * PROBLEM. Matches in the item's long work text, in the tech's proposed resolution, or in the category alone can raise a
 * rank but can never create a suggestion — otherwise generic words ("seal the joint", "flashing", "penetrations") stacked
 * up and suggested a cracked skylight lens for "six cracked tiles". Items already on the job are excluded.
 */
export function suggestFindings(job: Job, catalog: WorkCatalogItem[]): WorkCatalogItem[] {
  const issues = job.parsed?.issues ?? [];
  if (issues.length === 0) return [];
  const described = new Set(issues.flatMap((issue) => [...tokens(issue.description)]));
  if (described.size === 0) return [];
  const resolution = new Set(issues.flatMap((issue) => [...tokens(issue.resolution ?? "")]));
  const onJob = new Set((job.findings ?? []).flatMap((finding) => (finding.itemId ? [finding.itemId] : [])));

  return catalog
    .filter((item) => !onJob.has(item.itemId))
    .map((item) => {
      const problem = tokens(item.problem);
      const work = tokens(item.solution);
      let problemHits = 0;
      let score = 0;
      for (const word of described) {
        if (problem.has(word)) { problemHits += 1; score += 3; }
        else if (work.has(word)) score += 1;
      }
      for (const word of resolution) if (problem.has(word) || work.has(word)) score += 0.5;
      return { item, problemHits, score };
    })
    .filter(({ problemHits, score }) => problemHits >= 1 && score >= 3)
    .sort((a, b) => b.score - a.score || a.item.problem.localeCompare(b.item.problem))
    .slice(0, 5)
    .map(({ item }) => item);
}
