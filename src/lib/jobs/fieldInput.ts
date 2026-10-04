// Shared checks for the two field-note write paths (typed: /api/jobs/[jobId]/updates, voice: .../field-audio).
// Both are reachable with a no-login field QR, so their input is untrusted: everything the model sees about the job
// comes from the stored job, never from the request body.

/** The crew member's name as it lands on the ledger; blank/non-text falls back to the shared placeholder. */
export function workerName(value: unknown): string {
  return (typeof value === "string" ? value.trim().slice(0, 80) : "") || "Crew (no name given)";
}

/** A one-tap correction must name an existing update + item and carry a non-negative finite quantity. */
export function isValidCorrection(value: unknown): value is { targetUpdateId: string; item: string; newValue: number | string; field?: string; rawText?: string } {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  const n = Number(c.newValue);
  return typeof c.targetUpdateId === "string" && !!c.targetUpdateId && typeof c.item === "string" && !!c.item.trim()
    && c.newValue !== null && c.newValue !== "" && Number.isFinite(n) && n >= 0;
}

/** The job context handed to Whisper/the parser, read from the stored job record. */
export function storedJobContext(job: Record<string, unknown> | undefined) {
  const text = (v: unknown) => (typeof v === "string" ? v.slice(0, 300) : undefined);
  return { title: text(job?.title), address: text(job?.address), serviceType: text(job?.serviceType), clientName: text(job?.clientName) };
}

/** Who a field write is from. A signed-in person is always their own account (the request body cannot rename them);
 *  a no-login field-QR user is the name they typed, which is required — an unattributed note is the one thing the
 *  office can never fix afterwards. */
export type FieldAuthor = { name: string; uid?: string; via: "login" | "qr" };
export function resolveAuthor(
  user: { uid: string; displayName?: string; email?: string },
  typedName: unknown,
): FieldAuthor | { error: string } {
  if (user.uid.startsWith("field:")) {
    const name = typeof typedName === "string" ? typedName.trim().slice(0, 80) : "";
    if (!name) return { error: "Enter your name first, so the office knows who sent this." };
    return { name, via: "qr" };
  }
  const name = (user.displayName?.trim() || user.email?.trim() || "Team member").slice(0, 80);
  return { name, uid: user.uid, via: "login" };
}

/** The ledger fields that record the author on an update or photo. */
export function authorFields(author: FieldAuthor): { submittedBy: string; submittedByUid?: string; submittedVia: "login" | "qr" } {
  return { submittedBy: author.name, ...(author.uid ? { submittedByUid: author.uid } : {}), submittedVia: author.via };
}

/** A collision-proof ledger id — two crew members saving in the same millisecond must never overwrite each other. */
export function ledgerId(prefix: "upd" | "cor", now: number): string {
  return `${prefix}_${now}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Plain-words receipt of what a note added ("1 material, 8 h labor, 1 issue"). */
export function summarizeParsed(parsed: { materials?: unknown[]; labor?: Array<{ hours?: number }>; issues?: unknown[]; timeline?: unknown[] } | undefined): string {
  if (!parsed) return "Saved — the office will read it";
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts: string[] = [];
  if (parsed.materials?.length) parts.push(plural(parsed.materials.length, "material", "materials"));
  const hours = (parsed.labor ?? []).reduce((sum, l) => sum + (typeof l.hours === "number" ? l.hours : 0), 0);
  if (parsed.labor?.length) parts.push(hours > 0 ? `${Math.round(hours * 10) / 10} h labor` : plural(parsed.labor.length, "labor entry", "labor entries"));
  if (parsed.issues?.length) parts.push(plural(parsed.issues.length, "issue", "issues"));
  if (!parts.length && parsed.timeline?.length) parts.push(plural(parsed.timeline.length, "work step", "work steps"));
  return parts.length ? `Added ${parts.join(", ")}` : "Saved as a note";
}

/** Notes go only on work that is still open: an invoiced job's documents are already with the customer. */
export function refuseClosedJob(job: Record<string, unknown> | undefined, jobId: string): string | null {
  if (job?.status === "invoiced") return `${jobId} is already invoiced. Ask the office before adding to it.`;
  return null;
}

/** Keep an English rendering only when it says something the original doesn't (a translation). An English note's
 *  "translation" is the same text and would put a pointless "Show original" toggle on it. */
export function englishRendering(original: string, english: string | undefined): english is string {
  if (!english?.trim()) return false;
  const squash = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return squash(english) !== squash(original);
}
