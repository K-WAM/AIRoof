import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyFieldAccess } from "@/lib/auth/verifyRole";
import { getVerticalTemplate } from "@/lib/verticals/templates";
import type { Job, JobStatusChange } from "@/types/jobs";

// "Work complete" tap on the field screens.
//  - Runs under verifyFieldAccess, which pins a field grant to the job id in the URL path: one job, one action.
//  - Idempotent: a second tap (or a job already complete/invoiced) changes nothing and reports it.
//  - Never moves a job BACKWARDS: an invoiced job stays invoiced.
//  - Arrival/departure are NOT here — they are the time-clock punches (site_in / site_out).

type Context = { params: Promise<{ jobId: string }> };

export async function POST(req: NextRequest, { params }: Context): Promise<Response> {
  const { jobId } = await params;
  let body: { businessId?: string; completedBy?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { businessId } = body;
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyFieldAccess(req, businessId);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const bizSnap = await db.collection("businesses").doc(businessId).get();
  if (getVerticalTemplate(bizSnap.data()?.industry ?? "").disabledModules.includes("jobs")) {
    return NextResponse.json({ error: "Jobs module unavailable" }, { status: 403 });
  }

  const by = typeof body.completedBy === "string" && body.completedBy.trim() ? body.completedBy.trim().slice(0, 100) : gate.user.uid;
  const ref = db.collection(`businesses/${businessId}/jobs`).doc(jobId);
  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { missing: true as const };
    const job = snap.data() as Job;
    if (job.status === "complete" || job.status === "invoiced") return { status: job.status, changed: false as const };
    const now = Date.now();
    const change: JobStatusChange = { status: "complete", at: now, by };
    tx.update(ref, { status: "complete", completedAt: now, updatedAt: now, statusHistory: [...(job.statusHistory ?? []), change] });
    return { status: "complete" as const, changed: true as const };
  });
  if ("missing" in outcome) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json({ ok: true, status: outcome.status, changed: outcome.changed });
}
