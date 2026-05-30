import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { parseFieldUpdate } from "@/lib/ai/deepseekClient";
import type { FieldMaterial, FieldLaborEntry, FieldTimelineEvent, FieldAuditEntry } from "@/types/jobs";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const body = await req.json();
  const { businessId, audioBase64, mimeType, submittedBy, jobContext } = body;

  if (!businessId || !audioBase64) {
    return NextResponse.json({ error: "businessId and audioBase64 required" }, { status: 400 });
  }

  if (!openai) {
    return NextResponse.json({ error: "OpenAI not configured" }, { status: 503 });
  }

  // 1. Transcribe with Whisper
  let transcript: string;
  try {
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const ext = (mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm";
    const audioFile = await toFile(audioBuffer, `audio.${ext}`, {
      type: mimeType || "audio/webm",
    });
    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: audioFile,
    });
    transcript = transcription.text.trim();
  } catch (err) {
    return NextResponse.json({
      error: "Transcription failed",
      details: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }

  if (!transcript || transcript.length < 3) {
    return NextResponse.json({ success: false, error: "No speech detected", transcript: "" });
  }

  // 2. Load current job for context and merging
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const jobRef = db.collection(`businesses/${businessId}/jobs`).doc(jobId);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  const jobData = jobSnap.data()!;

  // 3. Parse transcript with GPT-4o extraction
  const parsed = await parseFieldUpdate({
    rawText: transcript,
    businessName: jobContext?.businessName || "the business",
    language: "en",
    jobContext,
  });

  // 4. Merge materials — add quantity if same item already exists
  const existingMaterials: FieldMaterial[] = jobData.materials || [];
  const mergedMaterials = [...existingMaterials];
  for (const mat of parsed.materials) {
    const qty = parseFloat(mat.quantity || "1") || 1;
    const idx = mergedMaterials.findIndex(
      (m) => m.name.toLowerCase() === mat.item.toLowerCase()
    );
    if (idx >= 0) {
      mergedMaterials[idx] = { ...mergedMaterials[idx], quantity: mergedMaterials[idx].quantity + qty };
    } else {
      mergedMaterials.push({ name: mat.item, quantity: qty, unit: mat.unit || "units" });
    }
  }

  // 5. New labor entries
  const newLaborEntries: FieldLaborEntry[] = parsed.labor.map((l) => ({
    workerName: l.description,
    timeIn: l.arrivalTime,
    timeOut: l.departureTime,
    hours: l.hours,
  }));

  // 6. New timeline events
  const newTimelineEvents: FieldTimelineEvent[] = parsed.timeline.map((t) => ({
    eventType: "other",
    time: t.time,
    notes: t.description,
  }));

  // 7. New notes from issues
  const newNotes: string[] = parsed.issues.map(
    (i) => `[${i.severity.toUpperCase()}] ${i.description}`
  );

  // 8. Recalculate total labor hours
  const allLabor: FieldLaborEntry[] = [
    ...(jobData.laborEntries || []),
    ...newLaborEntries,
  ];
  const totalLaborHours = allLabor.reduce((sum, e) => sum + (e.hours || 0), 0);

  // 9. Build audit entry + changes summary
  const parts: string[] = [];
  if (newTimelineEvents.length) parts.push(`${newTimelineEvents.length} timeline event(s)`);
  if (parsed.materials.length) parts.push(`${parsed.materials.length} material(s)`);
  if (newLaborEntries.length) parts.push(`${newLaborEntries.length} labor entry(s)`);
  if (newNotes.length) parts.push(`${newNotes.length} note(s)`);
  const changesSummary = parts.length
    ? `Added ${parts.join(", ")}`
    : "No structured data extracted";

  const auditEntry: FieldAuditEntry = {
    timestamp: new Date().toISOString(),
    userId: businessId,
    userName: submittedBy || "field-worker",
    transcript,
    changesSummary,
  };

  // 10. Compute updated arrays
  const updatedLaborEntries: FieldLaborEntry[] = [
    ...(jobData.laborEntries || []),
    ...newLaborEntries,
  ];
  const updatedTimelineEvents: FieldTimelineEvent[] = [
    ...(jobData.timelineEvents || []),
    ...newTimelineEvents,
  ];
  const updatedFieldNotes: string[] = [
    ...(jobData.fieldNotes || []),
    ...newNotes,
  ];
  const updatedAuditLog: FieldAuditEntry[] = [
    ...(jobData.auditLog || []),
    auditEntry,
  ];

  const now = Date.now();

  // 11. Update job document
  await jobRef.update({
    materials: mergedMaterials,
    laborEntries: updatedLaborEntries,
    timelineEvents: updatedTimelineEvents,
    fieldNotes: updatedFieldNotes,
    totalLaborHours,
    auditLog: updatedAuditLog,
    updatedAt: now,
    // Bump status to in_progress if it hasn't started yet
    ...(["open", "inspection"].includes(jobData.status || "") ? { status: "in_progress" } : {}),
  });

  // 12. Save to updates subcollection for backward compat with job detail page
  const updateId = `upd_${now}`;
  await db
    .collection(`businesses/${businessId}/jobs/${jobId}/updates`)
    .doc(updateId)
    .set({
      updateId,
      rawText: transcript,
      language: "en",
      submittedBy: submittedBy || "field-worker",
      createdAt: now,
      parsed,
    });

  return NextResponse.json({
    success: true,
    transcript,
    changesSummary,
    updatedJob: {
      materials: mergedMaterials,
      laborEntries: updatedLaborEntries,
      timelineEvents: updatedTimelineEvents,
      fieldNotes: updatedFieldNotes,
      totalLaborHours,
    },
  });
}
