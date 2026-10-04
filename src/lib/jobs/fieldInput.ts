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
export type FieldAuthor = { name: string; uid?: string; via: "login" | "qr"; crewId?: string; crewName?: string };
export function resolveAuthor(
  user: { uid: string; displayName?: string; email?: string; crewId?: string },
  typedName: unknown,
): FieldAuthor | { error: string } {
  if (user.uid.startsWith("field:")) {
    const name = typeof typedName === "string" ? typedName.trim().slice(0, 80) : "";
    if (!name) return { error: "Enter your name first, so the office knows who sent this." };
    return { name, via: "qr" };
  }
  const name = (user.displayName?.trim() || user.email?.trim() || "Team member").slice(0, 80);
  return { name, uid: user.uid, via: "login", ...(user.crewId ? { crewId: user.crewId } : {}) };
}

/** The ledger fields that record the author on an update or photo. */
export function authorFields(author: FieldAuthor): { submittedBy: string; submittedByUid?: string; submittedVia: "login" | "qr"; submittedByCrewId?: string; submittedByCrew?: string } {
  return {
    submittedBy: author.name, ...(author.uid ? { submittedByUid: author.uid } : {}), submittedVia: author.via,
    ...(author.crewId ? { submittedByCrewId: author.crewId } : {}), ...(author.crewName ? { submittedByCrew: author.crewName } : {}),
  };
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


/** Keep an English rendering only when it says something the original doesn't (a translation). An English note's
 *  "translation" is the same text and would put a pointless "Show original" toggle on it. */
export function englishRendering(original: string, english: string | undefined): english is string {
  if (!english?.trim()) return false;
  const squash = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return squash(english) !== squash(original);
}

/** Adds the crew's display name to a signed-in author (one point read; a QR author has no crew). Best effort. */
export async function withCrewName<T extends FieldAuthor>(
  db: { collection(path: string): { doc(id: string): { get(): Promise<{ data(): Record<string, unknown> | undefined }> } } },
  businessId: string,
  author: T,
): Promise<T> {
  if (!author.crewId) return author;
  try {
    const name = (await db.collection(`businesses/${businessId}/crews`).doc(author.crewId).get()).data()?.name;
    return typeof name === "string" && name.trim() ? { ...author, crewName: name.trim().slice(0, 80) } : author;
  } catch { return author; }
}
