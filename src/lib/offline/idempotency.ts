import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

const RETENTION_MS = 90 * 24 * 60 * 60_000;
const MAX_OFFLINE_AGE_MS = 30 * 24 * 60 * 60_000;
interface Receipt { fingerprint: string; state: "pending" | "done"; status?: number; body?: string }

/** Claim before any paid work. Transaction retries never execute work/AI calls.
 * An interrupted claim is deliberately not stolen: the provider may already have charged us.
 * Keep the phone copy and ask the office to reconcile rather than risk applying/billing twice.
 */
export async function idempotentFieldRequest(
  db: FirebaseFirestore.Firestore,
  businessId: string,
  scope: string,
  body: Record<string, unknown>,
  work: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const key = body.clientRequestId;
  if (key === undefined) return work();
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(key)) return NextResponse.json({ error: "Invalid clientRequestId" }, { status: 400 });
  const capturedAt = body.clientCreatedAt;
  if (capturedAt !== undefined && (typeof capturedAt !== "number" || !Number.isFinite(capturedAt) || capturedAt > Date.now() + 60_000 || capturedAt < Date.now() - MAX_OFFLINE_AGE_MS)) {
    return NextResponse.json({ error: "This saved entry's time needs office review. It has not been applied." }, { status: 422 });
  }
  const id = createHash("sha256").update(`${scope}:${key}`).digest("hex");
  const fingerprint = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const ref = db.collection(`businesses/${businessId}/idempotency`).doc(id);
  const previous = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.exists) return snap.data() as Receipt;
    // Pending claims have no TTL: deleting one could replay an already paid operation after a crash.
    tx.set(ref, { state: "pending", fingerprint, createdAt: new Date() });
    return null;
  });
  if (previous) {
    if (previous.fingerprint !== fingerprint) return NextResponse.json({ error: "This request ID already belongs to a different entry." }, { status: 409 });
    if (previous.state === "done") return new NextResponse(previous.body, { status: previous.status, headers: { "Content-Type": "application/json", "x-idempotency-final": "1" } });
    return NextResponse.json({ error: "This entry is still being processed. If it keeps waiting, ask the office to check it. Your phone copy is kept." }, { status: 425 });
  }
  let response: NextResponse;
  try { response = await work(); }
  catch (error) {
    // Do not release an ambiguous claim. A Firestore write or provider request may have succeeded.
    console.error("Field request interrupted", { id, error: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "The result needs office review before retrying. Your phone copy is kept." }, { status: 425 });
  }
  const result = await response.clone().text();
  await db.runTransaction(async tx => {
    tx.set(ref, { state: "done", fingerprint, status: response.status, body: result, expiresAt: new Date(Date.now() + RETENTION_MS) });
  });
  response.headers.set("x-idempotency-final", "1");
  return response;
}
