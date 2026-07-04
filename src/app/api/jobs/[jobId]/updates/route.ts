import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyFieldAccess } from "@/lib/auth/verifyRole";
import { parseFieldUpdate } from "@/lib/ai/deepseekClient";
import { buildProjection, resolveCorrection, parsedToFieldLog } from "@/lib/jobs/projection";
import type { FieldUpdate } from "@/types/jobs";

// GET /api/jobs/[jobId]/updates?businessId=xxx (session or field key)
export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyFieldAccess(req, businessId);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const snap = await db
    .collection(`businesses/${businessId}/jobs/${jobId}/updates`)
    .orderBy("createdAt", "asc")
    .get();

  const updates = snap.docs.map((d) => ({ updateId: d.id, ...d.data() })) as FieldUpdate[];
  return NextResponse.json({ updates });
}

// Recompute job.parsed from the full ledger and write it + the legacy display mirror.
async function writeProjection(
  db: FirebaseFirestore.Firestore,
  businessId: string,
  jobId: string,
  ledger: FieldUpdate[],
  bumpStatus = true
) {
  const projection = buildProjection(ledger);
  const log = parsedToFieldLog(projection);
  const jobRef = db.collection(`businesses/${businessId}/jobs`).doc(jobId);
  const snap = await jobRef.get();
  const status = snap.data()?.status;
  await jobRef.update({
    parsed: projection,
    materials: log.materials,
    laborEntries: log.laborEntries,
    timelineEvents: log.timelineEvents,
    fieldNotes: log.fieldNotes,
    totalLaborHours: log.totalLaborHours,
    updatedAt: Date.now(),
    ...(bumpStatus && ["open", "inspection"].includes(status ?? "") ? { status: "in_progress" } : {}),
  });
  return projection;
}

async function loadLedger(db: FirebaseFirestore.Firestore, businessId: string, jobId: string): Promise<FieldUpdate[]> {
  const snap = await db.collection(`businesses/${businessId}/jobs/${jobId}/updates`).orderBy("createdAt", "asc").get();
  return snap.docs.map((d) => ({ updateId: d.id, ...d.data() })) as FieldUpdate[];
}

// POST /api/jobs/[jobId]/updates
//  - normal submit: store raw entry, recompute projection
//  - correction detected (and not forced normal): return a proposedCorrection (no write) for one-tap confirm
//  - confirmCorrection payload present: write the correction event, recompute projection
export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const body = await req.json();
  const { businessId, rawText, language, submittedBy, businessName, jobContext, forceNormal, confirmCorrection } = body;

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyFieldAccess(req, businessId);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const now = Date.now();
  const updatesCol = db.collection(`businesses/${businessId}/jobs/${jobId}/updates`);

  // ── Confirm step: write the correction event the user approved ──
  if (confirmCorrection && confirmCorrection.targetUpdateId && confirmCorrection.item) {
    const corrId = `cor_${now}`;
    const corrEntry: FieldUpdate = {
      updateId: corrId,
      kind: "correction",
      rawText: confirmCorrection.rawText ?? "",
      submittedBy: submittedBy ?? undefined,
      createdAt: now,
      targetUpdateId: confirmCorrection.targetUpdateId,
      correctionField: confirmCorrection.field === "labor" ? "labor" : "materials",
      correctionItem: confirmCorrection.item,
      correctionNewValue: Number(confirmCorrection.newValue),
    };
    await updatesCol.doc(corrId).set(corrEntry);
    const ledger = await loadLedger(db, businessId, jobId);
    const projection = await writeProjection(db, businessId, jobId, ledger, false);
    return NextResponse.json({ ok: true, corrected: true, projection }, { status: 201 });
  }

  if (!rawText?.trim()) {
    return NextResponse.json({ error: "rawText required" }, { status: 400 });
  }

  // ── Parse + correction detection — industry-aware (multi-vertical platform) ──
  const bizSnap = await db.collection("businesses").doc(businessId).get();
  const biz = bizSnap.data();
  let parsed;
  try {
    parsed = await parseFieldUpdate({
      rawText: rawText.trim(),
      businessName: biz?.businessName ?? businessName ?? "the business",
      industry: biz?.industry,
      language,
      jobContext,
    });
  } catch (err) {
    // Store raw so nothing is lost; projection unchanged
    const updateId = `upd_${now}`;
    await updatesCol.doc(updateId).set({ updateId, kind: "normal", rawText: rawText.trim(), language: language ?? "en", submittedBy: submittedBy ?? undefined, createdAt: now, parseError: err instanceof Error ? err.message : "Parse failed" });
    return NextResponse.json({ update: { updateId, rawText: rawText.trim(), parseError: true } }, { status: 201 });
  }

  // ── Correction path: propose (don't apply) so the field user confirms ──
  if (parsed.correction && !forceNormal) {
    const ledger = await loadLedger(db, businessId, jobId);
    const resolved = resolveCorrection(ledger, parsed.correction.item, parsed.correction.newValue, parsed.correction.field ?? "materials");
    if (resolved) {
      return NextResponse.json({
        proposedCorrection: {
          ...resolved,
          field: parsed.correction.field ?? "materials",
          item: parsed.correction.item,
          rawText: rawText.trim(),
        },
      });
    }
    // No matching prior entry — fall through and save as a normal note so info isn't lost.
  }

  // ── Normal path: append entry, recompute projection ──
  const updateId = `upd_${now}`;
  const entry: FieldUpdate = {
    updateId,
    kind: "normal",
    rawText: rawText.trim(),
    language: language ?? "en",
    submittedBy: submittedBy ?? undefined,
    createdAt: now,
    parsed,
  };
  await updatesCol.doc(updateId).set(entry);
  const ledger = await loadLedger(db, businessId, jobId);
  const projection = await writeProjection(db, businessId, jobId, ledger);

  return NextResponse.json({ update: { ...entry, parsed }, projection }, { status: 201 });
}
