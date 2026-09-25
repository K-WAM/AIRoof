import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyFieldAccess } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { getVerticalTemplate } from "@/lib/verticals/templates";
import { copyCatalogFinding } from "@/lib/jobs/findings";
import type { Job } from "@/types/jobs";
import type { JobFinding, WorkCatalog } from "@/types/workCatalog";

// Field-safe findings endpoint: a technician on the field screen picks a Library finding for THIS job.
//  - Runs under verifyFieldAccess, which pins a field grant to the job id in the URL path, so a grant for one job can
//    never touch another.
//  - Deliberately narrow: GET lists catalog item names (NO prices/lines — crews don't need them); POST appends ONE
//    catalog item by id as a point-in-time snapshot (server-side copy, so the crew can't invent findings or prices).
//  - Removal and free-text findings stay office-only (PATCH /api/jobs/[jobId]).

type Context = { params: Promise<{ jobId: string }> };
const MAX_FINDINGS = 60;

async function load(req: NextRequest, jobId: string, businessId: string) {
  const gate = await verifyFieldAccess(req, businessId);
  if ("error" in gate) return { error: gate.error };
  const db = getAdminFirestore();
  if (!db) return { error: NextResponse.json({ error: "Database unavailable" }, { status: 503 }) };
  const [bizSnap, jobSnap, catalogSnap] = await Promise.all([
    db.collection("businesses").doc(businessId).get(),
    db.collection(`businesses/${businessId}/jobs`).doc(jobId).get(),
    db.collection(`businesses/${businessId}/library`).doc("workCatalog").get(),
  ]);
  if (getVerticalTemplate(bizSnap.data()?.industry ?? "").disabledModules.includes("jobs")) {
    return { error: NextResponse.json({ error: "Jobs module unavailable" }, { status: 403 }) };
  }
  if (!jobSnap.exists) return { error: NextResponse.json({ error: "Job not found" }, { status: 404 }) };
  const catalog: WorkCatalog = catalogSnap.exists ? (catalogSnap.data() as WorkCatalog) : { items: [] };
  return { db, job: jobSnap.data() as Job, catalog };
}

export async function GET(req: NextRequest, { params }: Context) {
  const { jobId } = await params;
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const loaded = await load(req, jobId, businessId);
  if ("error" in loaded) return loaded.error;
  return jsonWithCache({
    items: loaded.catalog.items.map(({ itemId, category, problem, solution, severity }) => ({ itemId, category, problem, solution, severity })),
    findings: (loaded.job.findings ?? []).map((f) => ({ findingId: f.findingId, itemId: f.itemId, category: f.category, problem: f.problem })),
  }, "noStore");
}

export async function POST(req: NextRequest, { params }: Context) {
  const { jobId } = await params;
  let body: { businessId?: string; itemId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { businessId, itemId } = body;
  if (!businessId || typeof itemId !== "string" || !itemId) {
    return NextResponse.json({ error: "businessId and itemId required" }, { status: 400 });
  }
  const loaded = await load(req, jobId, businessId);
  if ("error" in loaded) return loaded.error;

  const item = loaded.catalog.items.find((candidate) => candidate.itemId === itemId);
  if (!item) return NextResponse.json({ error: "Library item not found" }, { status: 404 });

  const ref = loaded.db.collection(`businesses/${businessId}/jobs`).doc(jobId);
  const outcome = await loaded.db.runTransaction(async (tx) => {
    const fresh = (await tx.get(ref)).data() as Job | undefined;
    const existing = fresh?.findings ?? [];
    const already = existing.find((f) => f.itemId === itemId);
    if (already) return { finding: already, added: false as const };
    if (existing.length >= MAX_FINDINGS) return { full: true as const };
    const finding: JobFinding = copyCatalogFinding(item);
    tx.update(ref, { findings: [...existing, finding], updatedAt: Date.now() });
    return { finding, added: true as const };
  });
  if ("full" in outcome) return NextResponse.json({ error: `A job can have at most ${MAX_FINDINGS} findings` }, { status: 409 });
  return NextResponse.json({ finding: { findingId: outcome.finding.findingId, itemId, problem: outcome.finding.problem }, added: outcome.added },
    { status: outcome.added ? 201 : 200 });
}
