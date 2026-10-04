import { NextRequest, NextResponse } from "next/server";
import { authorFields, englishRendering, isValidCorrection, ledgerId, resolveAuthor, storedJobContext, summarizeParsed } from "@/lib/jobs/fieldInput";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyFieldAccess } from "@/lib/auth/verifyRole";
import { parseFieldUpdate } from "@/lib/ai/deepseekClient";
import { detectLanguage } from "@/lib/i18n/detect";
import { resolveCorrection } from "@/lib/jobs/projection";
import { loadLedger, writeJobProjection } from "@/lib/jobs/writeProjection";
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

// POST /api/jobs/[jobId]/updates
//  - normal submit: store raw entry, recompute projection
//  - correction detected (and not forced normal): return a proposedCorrection (no write) for one-tap confirm
//  - confirmCorrection payload present: write the correction event, recompute projection
const MAX_NOTE_CHARS = 5000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const { businessId, rawText, language, submittedBy, forceNormal, confirmCorrection } = body;

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  // Reachable with a no-login field QR: bound what reaches the model (cost) and the ledger (doc size), and refuse
  // shapes that would poison the projection (a NaN quantity, an object where a name belongs).
  if (rawText !== undefined && (typeof rawText !== "string" || rawText.length > MAX_NOTE_CHARS)) {
    return NextResponse.json({ error: `A note can be up to ${MAX_NOTE_CHARS} characters.` }, { status: 400 });
  }
  if (submittedBy !== undefined && submittedBy !== null && typeof submittedBy !== "string") {
    return NextResponse.json({ error: "submittedBy must be text" }, { status: 400 });
  }
  if (confirmCorrection && !isValidCorrection(confirmCorrection)) {
    return NextResponse.json({ error: "Invalid correction" }, { status: 400 });
  }

  const gate = await verifyFieldAccess(req, businessId, { write: true });
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const author = resolveAuthor(gate.user, submittedBy);
  if ("error" in author) return NextResponse.json({ error: author.error }, { status: 400 });
  const jobSnap = await db.collection(`businesses/${businessId}/jobs`).doc(jobId).get();
  if (!jobSnap.exists) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const now = Date.now();
  const updatesCol = db.collection(`businesses/${businessId}/jobs/${jobId}/updates`);

  // ── Confirm step: write the correction event the user approved ──
  if (confirmCorrection) {
    const corrId = ledgerId("cor", now);
    const corrEntry: FieldUpdate = {
      updateId: corrId,
      kind: "correction",
      rawText: typeof confirmCorrection.rawText === "string" ? confirmCorrection.rawText.slice(0, 2000) : "",
      ...authorFields(author),
      createdAt: now,
      targetUpdateId: confirmCorrection.targetUpdateId,
      correctionField: confirmCorrection.field === "labor" ? "labor" : "materials",
      correctionItem: confirmCorrection.item.trim().slice(0, 200),
      correctionNewValue: Number(confirmCorrection.newValue),
    };
    await updatesCol.doc(corrId).set(corrEntry);
    const ledger = await loadLedger(db, businessId, jobId);
    const projection = await writeJobProjection(db, businessId, jobId, { ledger, bumpStatus: false });
    return NextResponse.json({ ok: true, corrected: true, projection, jobId, submittedBy: author.name, changesSummary: "Correction applied" }, { status: 201 });
  }

  if (!rawText?.trim()) {
    return NextResponse.json({ error: "rawText required" }, { status: 400 });
  }

  // ── Parse + correction detection — industry-aware (multi-vertical platform) ──
  const biz = (await db.collection("businesses").doc(businessId).get()).data();
  // The job's own record is the context the model sees — never client-sent text (that was a prompt-injection seam
  // open to anyone holding a field QR). The body's jobContext/businessName are ignored.
  const serverJobContext = storedJobContext(jobSnap.data());

  // No Whisper on this path (typed text) — no model-provided language, so a cheap heuristic fills
  // the same role. Ambiguous text stays undefined and parseFieldUpdate's own model call decides —
  // no extra LLM call either way, this is just a hint for its LANGUAGE instruction block.
  const detectedLanguage: string | undefined = (typeof language === "string" && /^[a-z]{2}$/.test(language) ? language : undefined) ?? detectLanguage(rawText.trim());
  let parsed;
  try {
    parsed = await parseFieldUpdate({
      rawText: rawText.trim(),
      businessName: biz?.businessName ?? "the business",
      industry: biz?.industry,
      language: detectedLanguage,
      jobContext: serverJobContext,
    });
    if (detectedLanguage) parsed.sourceLanguage = detectedLanguage;
  } catch (err) {
    // Store raw so nothing is lost; projection unchanged
    const updateId = ledgerId("upd", now);
    await updatesCol.doc(updateId).set({ updateId, kind: "normal", rawText: rawText.trim(), language: detectedLanguage ?? "en", ...authorFields(author), createdAt: now, parseError: err instanceof Error ? err.message : "Parse failed" });
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
  const updateId = ledgerId("upd", now);
  const entry: FieldUpdate = {
    updateId,
    kind: "normal",
    rawText: rawText.trim(),
    language: detectedLanguage ?? "en",
    ...(englishRendering(rawText.trim(), parsed.transcriptEn) ? { rawTextEn: parsed.transcriptEn } : {}),
    ...authorFields(author),
    createdAt: now,
    parsed,
  };
  await updatesCol.doc(updateId).set(entry);
  const ledger = await loadLedger(db, businessId, jobId);
  const projection = await writeJobProjection(db, businessId, jobId, { ledger });

  return NextResponse.json({ update: { ...entry, parsed }, projection, jobId, submittedBy: author.name, changesSummary: summarizeParsed(parsed) }, { status: 201 });
}
