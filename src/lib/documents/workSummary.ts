import type { JobFinding } from "@/types/workCatalog";

// Short, blunt "what we did / what we will do" bullets for the customer-facing Description of work on an invoice or quote:
//   • Tile replacement
//   • Pipe collar replacement
// Built ONLY from what is already on the job's findings (deterministic, no LLM, nothing invented). The name of the work is
// the finding's own labor line ("Tile replacement"); failing that its first priced line; failing that a short clip of its
// standard work text. Long catalog sentences are deliberately NOT pasted in — the full wording still appears on the
// document's "Issues found & work recommended" section.

type WorkFinding = Pick<JobFinding, "problem" | "solution"> & Partial<Pick<JobFinding, "lines">>;

const MAX_BULLET = 80;

function sentenceClip(text: string): string {
  const first = text.trim().split(/(?<=[.!?])\s/)[0]?.replace(/[.\s]+$/, "") ?? "";
  if (first.length <= MAX_BULLET) return first;
  const head = first.slice(0, MAX_BULLET);
  const boundary = Math.max(head.lastIndexOf(", "), head.lastIndexOf(" and "));
  // A clause break can land right on the comma that precedes " and ", so strip trailing commas too.
  return (boundary >= 30 ? head.slice(0, boundary) : head.slice(0, head.lastIndexOf(" "))).replace(/[,s]+$/, "");
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One blunt line for one finding. */
export function workBullet(finding: WorkFinding): string {
  const lines = (finding.lines ?? []).filter((line) => line.description.trim());
  const named = lines.find((line) => line.kind === "labor") ?? lines[0];
  const text = named ? named.description.trim() : sentenceClip(finding.solution) || sentenceClip(finding.problem);
  const clipped = text.length > MAX_BULLET ? sentenceClip(text) : text;
  return capitalise(clipped.replace(/[.\s]+$/, ""));
}

/** De-duplicated bullets (case-insensitive), in the order the findings were added. */
export function workBullets(findings: WorkFinding[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const finding of findings) {
    const bullet = workBullet(finding);
    const key = bullet.toLowerCase();
    if (!bullet || seen.has(key)) continue;
    seen.add(key);
    out.push(bullet);
  }
  return out;
}

/** The invoice's Description of work: one "• bullet" per line, or "" when there is nothing to say. */
export function draftWorkDescription(findings: WorkFinding[] | undefined): string {
  return workBullets(findings ?? []).map((bullet) => `• ${bullet}`).join("\n");
}
