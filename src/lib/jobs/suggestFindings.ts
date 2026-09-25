import { normalizeName } from "@/lib/format/name";
import type { Job } from "@/types/jobs";
import type { WorkCatalogItem } from "@/types/workCatalog";

const tokens = (text: string) => new Set(normalizeName(text).split(/[^a-z0-9]+/).filter((word) => word.length > 2));

export function suggestFindings(job: Job, catalog: WorkCatalogItem[]): WorkCatalogItem[] {
  const issues = job.parsed?.issues ?? [];
  const issueTokens = new Set(issues.flatMap((issue) => [...tokens(issue.description), ...tokens(issue.resolution ?? "")]));
  const selected = new Set((job.findings ?? []).flatMap((finding) => finding.itemId ? [finding.itemId] : []));
  return catalog.filter((item) => !selected.has(item.itemId)).map((item) => ({ item, score: [...tokens(`${item.problem} ${item.solution}`)].filter((word) => issueTokens.has(word)).length }))
    .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || a.item.problem.localeCompare(b.item.problem)).slice(0, 5).map(({ item }) => item);
}
