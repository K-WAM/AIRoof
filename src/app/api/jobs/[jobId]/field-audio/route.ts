import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { parseFieldUpdate } from "@/lib/ai/deepseekClient";
import { buildProjection, resolveCorrection, parsedToFieldLog } from "@/lib/jobs/projection";
import type { FieldUpdate } from "@/types/jobs";

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

async function loadLedger(db: FirebaseFirestore.Firestore, businessId: string, jobId: string): Promise<FieldUpdate[]> {
  const snap = await db.collection(`businesses/${businessId}/jobs/${jobId}/updates`).orderBy("createdAt", "asc").get();
  return snap.docs.map((d) => ({ updateId: d.id, ...d.data() })) as FieldUpdate[];
}

async function writeProjection(db: FirebaseFirestore.Firestore, businessId: string, jobId: string, ledger: FieldUpdate[]) {
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
    ...(["open", "inspection"].includes(status ?? "") ? { status: "in_progress" } : {}),
  });
  return { projection, log };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const body = await req.json();
  const { businessId, audioBase64, mimeType, submittedBy, jobContext, confirmCorrection, forceNormal } = body;

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const updatesCol = db.collection(`businesses/${businessId}/jobs/${jobId}/updates`);
  const now = Date.now();

  // ── Confirm step (correction approved on the device) ──
  if (confirmCorrection && confirmCorrection.targetUpdateId && confirmCorrection.item) {
    const corrId = `cor_${now}`;
    await updatesCol.doc(corrId).set({
      updateId: corrId,
      kind: "correction",
      rawText: confirmCorrection.rawText ?? "",
      submittedBy: submittedBy ?? undefined,
      createdAt: now,
      targetUpdateId: confirmCorrection.targetUpdateId,
      correctionField: confirmCorrection.field === "labor" ? "labor" : "materials",
      correctionItem: confirmCorrection.item,
      correctionNewValue: Number(confirmCorrection.newValue),
    } as FieldUpdate);
    const ledger = await loadLedger(db, businessId, jobId);
    const { log } = await writeProjection(db, businessId, jobId, ledger);
    return NextResponse.json({ success: true, corrected: true, updatedJob: log });
  }

  if (!audioBase64) return NextResponse.json({ error: "audioBase64 required" }, { status: 400 });
  if (!openai) return NextResponse.json({ error: "OpenAI not configured" }, { status: 503 });

  // 1. Transcribe with Whisper
  let transcript: string;
  try {
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const ext = (mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm";
    const audioFile = await toFile(audioBuffer, `audio.${ext}`, { type: mimeType || "audio/webm" });
    const transcription = await openai.audio.transcriptions.create({ model: "whisper-1", file: audioFile });
    transcript = transcription.text.trim();
  } catch (err) {
    return NextResponse.json({ error: "Transcription failed", details: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  if (!transcript || transcript.length < 3) {
    return NextResponse.json({ success: false, error: "No speech detected", transcript: "" });
  }

  // 2. Parse + correction detection
  const parsed = await parseFieldUpdate({
    rawText: transcript,
    businessName: jobContext?.businessName || "the business",
    language: "en",
    jobContext,
  });

  // 3. Correction path — propose, don't apply
  if (parsed.correction && !forceNormal) {
    const ledger = await loadLedger(db, businessId, jobId);
    const resolved = resolveCorrection(ledger, parsed.correction.item, parsed.correction.newValue, parsed.correction.field ?? "materials");
    if (resolved) {
      return NextResponse.json({
        success: true,
        transcript,
        proposedCorrection: { ...resolved, field: parsed.correction.field ?? "materials", item: parsed.correction.item, rawText: transcript },
      });
    }
  }

  // 4. Normal path — append entry, recompute projection
  const updateId = `upd_${now}`;
  await updatesCol.doc(updateId).set({
    updateId,
    kind: "normal",
    rawText: transcript,
    language: "en",
    submittedBy: submittedBy || "field-worker",
    createdAt: now,
    parsed,
  } as FieldUpdate);

  const ledger = await loadLedger(db, businessId, jobId);
  const { log } = await writeProjection(db, businessId, jobId, ledger);

  const parts: string[] = [];
  if (parsed.timeline.length) parts.push(`${parsed.timeline.length} timeline event(s)`);
  if (parsed.materials.length) parts.push(`${parsed.materials.length} material(s)`);
  if (parsed.labor.length) parts.push(`${parsed.labor.length} labor entry(s)`);
  if (parsed.issues.length) parts.push(`${parsed.issues.length} note(s)`);
  const changesSummary = parts.length ? `Added ${parts.join(", ")}` : "No structured data extracted";

  return NextResponse.json({ success: true, transcript, changesSummary, updatedJob: log });
}
