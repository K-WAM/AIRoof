import { NextRequest, NextResponse } from "next/server";
import { toFile } from "openai/uploads";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyFieldAccess } from "@/lib/auth/verifyRole";
import { parseFieldUpdate, ParseFieldUpdateError } from "@/lib/ai/deepseekClient";
import { buildProjection, resolveCorrection, parsedToFieldLog } from "@/lib/jobs/projection";
import { isProviderReady } from "@/lib/ai/registry";
import type { FieldUpdate } from "@/types/jobs";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ["audio/", "video/"];
const WHISPER_TIMEOUT_MS = 30_000;

function buildWhisperPrompt(jobContext?: { title?: string; address?: string; serviceType?: string; clientName?: string }): string {
  const context = [jobContext?.title, jobContext?.clientName, jobContext?.address, jobContext?.serviceType]
    .filter(Boolean)
    .join(", ");
  return [
    context ? `Job-site field update for: ${context}.` : "Job-site field update from a service crew.",
    "May include materials with quantities (squares of shingles, bundles, rolls of underlayment, drip edge, flashing, plywood, OSB, 2x4s, nails),",
    "crew member first names, arrival and departure times, hours worked, and issues found (leak, rot, mold, damaged, cracked).",
    "Corrections sound like: make that 120 not 150, scratch that, I meant.",
  ].join(" ");
}

function validateAudioInput(audioBase64: string, mimeType?: string): { error?: string } {
  if (!audioBase64 || audioBase64.length === 0) {
    return { error: "audioBase64 is empty" };
  }

  const decodedLen = Math.floor((audioBase64.length * 3) / 4);
  if (decodedLen > MAX_AUDIO_BYTES) {
    return { error: `Audio exceeds maximum size of ${MAX_AUDIO_BYTES / (1024 * 1024)}MB` };
  }

  if (mimeType && !ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    return { error: `Unsupported MIME type: ${mimeType}` };
  }

  return {};
}

function isTranscriptEmpty(transcript: string): boolean {
  return !transcript || transcript.trim().length < 3;
}

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

  const gate = await verifyFieldAccess(req, businessId);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const updatesCol = db.collection(`businesses/${businessId}/jobs/${jobId}/updates`);
  const now = Date.now();

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

  const audioCheck = validateAudioInput(audioBase64, mimeType);
  if (audioCheck.error) return NextResponse.json({ error: audioCheck.error }, { status: 400 });

  const openaiReady = isProviderReady("openai");
  if (!openaiReady) {
    return NextResponse.json(
      { error: "OpenAI provider not configured — transcription unavailable" },
      { status: 503 },
    );
  }

  const openai = (await import("openai")).default;
  const openaiClient = new openai({ apiKey: process.env.OPENAI_API_KEY });

  let transcript: string;
  try {
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const ext = (mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm";
    const audioFile = await toFile(audioBuffer, `audio.${ext}`, { type: mimeType || "audio/webm" });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WHISPER_TIMEOUT_MS);

    const transcription = await openaiClient.audio.transcriptions.create(
      {
        model: "whisper-1",
        file: audioFile,
        prompt: buildWhisperPrompt(jobContext),
      },
      { signal: controller.signal },
    );

    clearTimeout(timeout);
    transcript = transcription.text.trim();
  } catch (err) {
    return NextResponse.json(
      { error: "Transcription failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  if (isTranscriptEmpty(transcript)) {
    return NextResponse.json({ success: false, error: "No speech detected", transcript: "" });
  }

  const bizSnap = await db.collection("businesses").doc(businessId).get();
  const biz = bizSnap.data();

  let parsed;
  try {
    parsed = await parseFieldUpdate({
      rawText: transcript,
      businessName: biz?.businessName || jobContext?.businessName || "the business",
      industry: biz?.industry,
      language: "en",
      jobContext,
      modelOverrides: biz?.backOfficeModel
        ? { backOfficeModel: biz.backOfficeModel }
        : undefined,
    });
  } catch (err) {
    if (err instanceof ParseFieldUpdateError && err.needsConfirmation) {
      const updateId = `upd_${now}`;
      await updatesCol.doc(updateId).set({
        updateId,
        kind: "normal",
        rawText: transcript,
        language: "en",
        submittedBy: submittedBy || "field-worker",
        createdAt: now,
        parseError: err.message,
      } as FieldUpdate);

      return NextResponse.json({
        success: true,
        transcript,
        needsConfirmation: true,
        confirmationReason: err.message,
        changesSummary: "Extraction needs review — raw transcript saved",
      });
    }

    return NextResponse.json(
      { error: "Field update parsing failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

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
