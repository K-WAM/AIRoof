import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { parseFieldUpdate } from "@/lib/ai/deepseekClient";
import { loadLedger, writeJobProjection } from "@/lib/jobs/writeProjection";
import type { FieldUpdate } from "@/types/jobs";

// POST /api/jobs/[jobId]/updates/[updateId]/reparse  body: { businessId }
// The office's "Retry" on a field update stored as "Parse failed". The raw note was saved when the parse failed (nothing
// is lost), so this re-runs the same parser on it, clears the error and recomputes the job. An office action, so it
// needs a staff session — a field QR grant can submit notes but not rewrite them.
export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string; updateId: string }> }) {
  const { jobId, updateId } = await params;
  const body = await req.json().catch(() => ({}));
  const businessId: string | undefined = body?.businessId;
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const ref = db.collection(`businesses/${businessId}/jobs/${jobId}/updates`).doc(updateId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Update not found" }, { status: 404 });
  const update = { updateId, ...snap.data() } as FieldUpdate;
  if (update.kind === "correction" || !update.rawText?.trim()) {
    return NextResponse.json({ error: "This update has no note to read again" }, { status: 400 });
  }
  if (update.parsed && !update.parseError) return NextResponse.json({ update, changed: false });

  const [bizSnap, jobSnap] = await Promise.all([
    db.collection("businesses").doc(businessId).get(),
    db.collection(`businesses/${businessId}/jobs`).doc(jobId).get(),
  ]);
  const biz = bizSnap.data();
  const job = jobSnap.data();
  let parsed;
  try {
    parsed = await parseFieldUpdate({
      rawText: update.rawText.trim(),
      businessName: biz?.businessName ?? "the business",
      industry: biz?.industry,
      language: update.language,
      jobContext: job ? { title: job.title, address: job.address, serviceType: job.serviceType, clientName: job.clientName } : undefined,
    });
    if (update.language) parsed.sourceLanguage = update.language;
  } catch (err) {
    const parseError = err instanceof Error ? err.message : "Parse failed";
    await ref.update({ parseError });
    return NextResponse.json({ error: `Still could not read this note: ${parseError}` }, { status: 502 });
  }

  // Rewrite the whole entry without parseError (no FieldValue sentinel needed); everything else stays as recorded.
  const fixed: FieldUpdate = { ...update, parsed, ...(parsed.transcriptEn ? { rawTextEn: parsed.transcriptEn } : {}) };
  delete fixed.parseError;
  await ref.set(fixed);
  const ledger = await loadLedger(db, businessId, jobId);
  const projection = await writeJobProjection(db, businessId, jobId, { ledger });
  return NextResponse.json({ update: fixed, projection, changed: true });
}
