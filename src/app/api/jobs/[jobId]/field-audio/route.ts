import { NextRequest, NextResponse } from "next/server";
import { toFile } from "openai/uploads";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyFieldAccess } from "@/lib/auth/verifyRole";
import { parseFieldUpdate, ParseFieldUpdateError } from "@/lib/ai/deepseekClient";
import { buildWhisperPrompt } from "@/lib/ai/whisperPrompt";
import { normalizeLang } from "@/lib/i18n/detect";
import { resolveCorrection, parsedToFieldLog } from "@/lib/jobs/projection";
import { loadLedger, writeJobProjection } from "@/lib/jobs/writeProjection";
import { isProviderReady } from "@/lib/ai/registry";
import type { FieldUpdate } from "@/types/jobs";
import type { LibraryPricing } from "@/types/library";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ["audio/", "video/"];
const WHISPER_TIMEOUT_MS = 30_000;

// Whisper transcription + GPT-4o extraction + up to 3 Firestore round trips, run serially — this
// route already ran close to the platform default before Spanish added a translation hop to the
// same single extraction call. There is no other maxDuration export anywhere in the repo.
export const maxDuration = 60;

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const body = await req.json();
  const { businessId, audioBase64, mimeType, submittedBy, jobContext, confirmCorrection, forceNormal } = body;

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyFieldAccess(req, businessId, { write: true });
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
      submittedBy: submittedBy || "Crew (no name given)",
      createdAt: now,
      targetUpdateId: confirmCorrection.targetUpdateId,
      correctionField: confirmCorrection.field === "labor" ? "labor" : "materials",
      correctionItem: confirmCorrection.item,
      correctionNewValue: Number(confirmCorrection.newValue),
    } as FieldUpdate);
    const ledger = await loadLedger(db, businessId, jobId);
    const projection = await writeJobProjection(db, businessId, jobId, { ledger });
    return NextResponse.json({ success: true, corrected: true, updatedJob: parsedToFieldLog(projection) });
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

  // Fetched before transcription (not after, like before Spanish) — the biasing prompt now needs
  // agentLanguages/industry/Library material names, all of which live here.
  const [bizSnap, libSnap] = await Promise.all([
    db.collection("businesses").doc(businessId).get(),
    db.collection(`businesses/${businessId}/library`).doc("pricing").get(),
  ]);
  const biz = bizSnap.data();
  const libraryMaterialNames = ((libSnap.data() as LibraryPricing | undefined)?.materials ?? []).map((m) => m.name);

  // Timings (ms) for the one log line at the end — how long a technician really waits, by phase. Durations only, no content.
  const transcribeStart = Date.now();
  let transcribeMs = 0;
  let transcript: string;
  let detectedLanguage: string | undefined;
  try {
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const ext = (mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm";
    const audioFile = await toFile(audioBuffer, `audio.${ext}`, { type: mimeType || "audio/webm" });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WHISPER_TIMEOUT_MS);

    // Auto-detect — do NOT pass `language`. Crews code-switch mid-sentence ("puse doce bundles de
    // shingles"); forcing "es" degrades the English nouns, forcing "en" mangles the Spanish.
    // response_format: "verbose_json" is the only shape that returns `.language` back.
    const transcription = await openaiClient.audio.transcriptions.create(
      {
        model: "whisper-1",
        file: audioFile,
        prompt: buildWhisperPrompt(jobContext, biz?.agentLanguages, biz?.industry, libraryMaterialNames),
        response_format: "verbose_json",
        temperature: 0,
      },
      { signal: controller.signal },
    );

    clearTimeout(timeout);
    transcribeMs = Date.now() - transcribeStart;
    transcript = transcription.text.trim();
    detectedLanguage = normalizeLang(transcription.language);
  } catch (err) {
    return NextResponse.json(
      { error: "Transcription failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  if (isTranscriptEmpty(transcript)) {
    return NextResponse.json({ success: false, error: "No speech detected", transcript: "" });
  }

  const parseStart = Date.now();
  let parsed;
  try {
    parsed = await parseFieldUpdate({
      rawText: transcript,
      businessName: biz?.businessName || jobContext?.businessName || "the business",
      industry: biz?.industry,
      language: detectedLanguage ?? "en",
      jobContext,
      modelOverrides: biz?.backOfficeModel
        ? { backOfficeModel: biz.backOfficeModel }
        : undefined,
    });
    if (detectedLanguage) parsed.sourceLanguage = detectedLanguage;
  } catch (err) {
    if (err instanceof ParseFieldUpdateError && err.needsConfirmation) {
      const updateId = `upd_${now}`;
      await updatesCol.doc(updateId).set({
        updateId,
        kind: "normal",
        rawText: transcript,
        language: detectedLanguage ?? "en",
        submittedBy: submittedBy || "Crew (no name given)",
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

  const writeStart = Date.now();
  const updateId = `upd_${now}`;
  await updatesCol.doc(updateId).set({
    updateId,
    kind: "normal",
    rawText: transcript,
    language: detectedLanguage ?? "en",
    ...(parsed.transcriptEn ? { rawTextEn: parsed.transcriptEn } : {}),
    submittedBy: submittedBy || "Crew (no name given)",
    createdAt: now,
    parsed,
  } as FieldUpdate);

  const ledger = await loadLedger(db, businessId, jobId);
  const projection = await writeJobProjection(db, businessId, jobId, { ledger });
  const log = parsedToFieldLog(projection);

  const parts: string[] = [];
  if (parsed.timeline.length) parts.push(`${parsed.timeline.length} timeline event(s)`);
  if (parsed.materials.length) parts.push(`${parsed.materials.length} material(s)`);
  if (parsed.labor.length) parts.push(`${parsed.labor.length} labor entry(s)`);
  if (parsed.issues.length) parts.push(`${parsed.issues.length} note(s)`);
  const changesSummary = parts.length ? `Added ${parts.join(", ")}` : "No structured data extracted";
  console.info("field-audio timing", JSON.stringify({
    jobId, audioKB: Math.round((audioBase64.length * 3) / 4 / 1024), language: detectedLanguage ?? "en",
    transcribeMs, parseMs: writeStart - parseStart, saveMs: Date.now() - writeStart, totalMs: Date.now() - now,
  }));

  return NextResponse.json({ success: true, transcript, changesSummary, updatedJob: log });
}
