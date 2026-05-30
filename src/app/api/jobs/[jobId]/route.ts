import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";

const VALID_STATUSES = ["open", "inspection", "quoted", "in_progress", "invoiced", "complete"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const body = await req.json();
  const { businessId, status } = body;

  if (!businessId || !status) {
    return NextResponse.json({ error: "businessId and status required" }, { status: 400 });
  }
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  await db
    .collection(`businesses/${businessId}/jobs`)
    .doc(jobId)
    .update({ status, updatedAt: Date.now() });

  return NextResponse.json({ ok: true, status });
}
