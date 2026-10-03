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
