export interface DocumentFinding {
  category?: string;
  problem: string;
  solution: string;
  note?: string;
}

/** Display only. Categories follow first appearance; findings keep their order within each category. */
export function groupFindingsByCategory<T extends { category?: string; problem: string }>(findings: readonly T[]): Array<{ category: string; findings: T[] }> {
  const groups = new Map<string, T[]>();
  for (const finding of findings) {
    const category = finding.category?.trim() || "Findings";
    const group = groups.get(category);
    if (group) group.push(finding);
    else groups.set(category, [finding]);
  }
  return Array.from(groups, ([category, items]) => ({ category, findings: items }));
}
