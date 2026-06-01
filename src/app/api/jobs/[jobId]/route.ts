import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { parsedToFieldLog } from "@/lib/jobs/projection";
import type { Job, ParsedUpdate } from "@/types/jobs";

const VALID_STATUSES = ["open", "inspection", "quoted", "in_progress", "invoiced", "complete"];

// GET /api/jobs/[jobId]?businessId=xxx — fetch a single job
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const snap = await db
    .collection(`businesses/${businessId}/jobs`)
    .doc(jobId)
    .get();

  if (!snap.exists) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const job = { jobId: snap.id, ...snap.data() } as Job;
  return NextResponse.json({ job });
}

// PATCH supports: status change, admin edits to the parsed projection, and reportNotes.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const body = await req.json();
  const { businessId, status, parsed, reportNotes } = body as {
    businessId?: string; status?: string; parsed?: ParsedUpdate; reportNotes?: string;
  };

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (status === undefined && parsed === undefined && reportNotes === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const update: Record<string, unknown> = { updatedAt: Date.now() };
  if (status) update.status = status;
  if (reportNotes !== undefined) update.reportNotes = reportNotes;
  if (parsed) {
    // Admin override of the projection — keep the legacy display mirror in sync.
    const log = parsedToFieldLog(parsed);
    update.parsed = parsed;
    update.materials = log.materials;
    update.laborEntries = log.laborEntries;
    update.timelineEvents = log.timelineEvents;
    update.fieldNotes = log.fieldNotes;
    update.totalLaborHours = log.totalLaborHours;
  }

  await db.collection(`businesses/${businessId}/jobs`).doc(jobId).update(update);
  return NextResponse.json({ ok: true });
}
