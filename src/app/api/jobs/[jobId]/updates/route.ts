import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { parseFieldUpdate } from "@/lib/ai/deepseekClient";
import type { FieldUpdate } from "@/types/jobs";

// GET /api/jobs/[jobId]/updates?businessId=xxx
export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const snap = await db
    .collection(`businesses/${businessId}/jobs/${jobId}/updates`)
    .orderBy("createdAt", "asc")
    .get();

  const updates = snap.docs.map((d) => ({ updateId: d.id, ...d.data() })) as FieldUpdate[];
  return NextResponse.json({ updates });
}

// POST /api/jobs/[jobId]/updates — submit field update + trigger AI parse
export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const body = await req.json();
  const { businessId, rawText, language, submittedBy, businessName, jobContext } = body;

  if (!businessId || !rawText?.trim()) {
    return NextResponse.json({ error: "businessId and rawText required" }, { status: 400 });
  }

  const authResult = await verifyAuthAndRole(req, businessId, ["owner", "staff"]);
  if ("error" in authResult) return authResult.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const updateId = `upd_${Date.now()}`;
  const now = Date.now();

  const update: FieldUpdate = {
    updateId,
    rawText: rawText.trim(),
    language: language ?? "en",
    submittedBy: submittedBy ?? undefined,
    createdAt: now,
  };

  // Store raw update immediately
  await db
    .collection(`businesses/${businessId}/jobs/${jobId}/updates`)
    .doc(updateId)
    .set(update);

  // Update job's updatedAt
  await db
    .collection(`businesses/${businessId}/jobs`)
    .doc(jobId)
    .update({ updatedAt: now, status: "in_progress" });

  // Parse in the same request — DeepSeek is fast enough
  try {
    const parsed = await parseFieldUpdate({
      rawText: rawText.trim(),
      businessName: businessName ?? "the business",
      language,
      jobContext,
    });

    await db
      .collection(`businesses/${businessId}/jobs/${jobId}/updates`)
      .doc(updateId)
      .update({ parsed });

    return NextResponse.json({ update: { ...update, parsed } }, { status: 201 });
  } catch (err) {
    const parseError = err instanceof Error ? err.message : "Parse failed";
    await db
      .collection(`businesses/${businessId}/jobs/${jobId}/updates`)
      .doc(updateId)
      .update({ parseError });
    return NextResponse.json({ update: { ...update, parseError } }, { status: 201 });
  }
}
