import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyFieldAccess } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { getVerticalTemplate } from "@/lib/verticals/templates";
import { copyCatalogFinding, FINDING_NOTE_MAX, validFindingNote } from "@/lib/jobs/findings";
import type { Job } from "@/types/jobs";
import type { JobFinding, WorkCatalog } from "@/types/workCatalog";
import type { JobQuote } from "@/types/quote";

// Field-safe findings endpoint: a technician on the field screen picks a Library finding for THIS job.
//  - Runs under verifyFieldAccess, which pins a field grant to the job id in the URL path, so a grant for one job can
//    never touch another.
//  - Deliberately narrow: GET lists catalog item names (NO prices/lines — crews don't need them); POST appends ONE
//    catalog item by id as a point-in-time snapshot (server-side copy, so the crew can't invent findings or prices).
//  - PATCH sets ONE thing: the inspector's comment on a finding already on the job (owner, 2026-09-28: the inspector
//    "lists findings, should be able to add comments from field screen, then the findings feed into the quote").
//  - Removal and free-text findings stay office-only (PATCH /api/jobs/[jobId]).

type Context = { params: Promise<{ jobId: string }> };
const MAX_FINDINGS = 60;

async function load(req: NextRequest, jobId: string, businessId: string, write = false) {
  const gate = await verifyFieldAccess(req, businessId, write ? { write: true } : undefined);
  if ("error" in gate) return { ok: false as const, response: gate.error };
  const db = getAdminFirestore();
  if (!db) return { ok: false as const, response: NextResponse.json({ error: "Database unavailable" }, { status: 503 }) };
  const [bizSnap, jobSnap, catalogSnap] = await Promise.all([
    db.collection("businesses").doc(businessId).get(),
    db.collection(`businesses/${businessId}/jobs`).doc(jobId).get(),
    db.collection(`businesses/${businessId}/library`).doc("workCatalog").get(),
  ]);
  if (getVerticalTemplate(bizSnap.data()?.industry ?? "").disabledModules.includes("jobs")) {
    return { ok: false as const, response: NextResponse.json({ error: "Jobs module unavailable" }, { status: 403 }) };
  }
  if (!jobSnap.exists) return { ok: false as const, response: NextResponse.json({ error: "Job not found" }, { status: 404 }) };
  const catalog: WorkCatalog = catalogSnap.exists ? (catalogSnap.data() as WorkCatalog) : { items: [] };
  return { ok: true as const, db, job: jobSnap.data() as Job, catalog };
}

export async function GET(req: NextRequest, { params }: Context): Promise<Response> {
  const { jobId } = await params;
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const loaded = await load(req, jobId, businessId);
  if (!loaded.ok) return loaded.response;
  return jsonWithCache({
    items: loaded.catalog.items.map(({ itemId, category, problem, solution, severity }) => ({ itemId, category, problem, solution, severity })),
    findings: (loaded.job.findings ?? []).map((f) => ({ findingId: f.findingId, itemId: f.itemId, category: f.category, problem: f.problem, note: f.note })),
  }, "noStore");
}

export async function POST(req: NextRequest, { params }: Context): Promise<Response> {
  const { jobId } = await params;
  let body: { businessId?: string; itemId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { businessId, itemId } = body;
  if (!businessId || typeof itemId !== "string" || !itemId) {
    return NextResponse.json({ error: "businessId and itemId required" }, { status: 400 });
  }
  const loaded = await load(req, jobId, businessId, true);
  if (!loaded.ok) return loaded.response;

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

/**
 * The inspector's comment on one finding. A comment is a comment: no prices, no wording changes. It also lands on the
 * job's quote while that quote is still a draft, so the office sees it where it prices the work; a sent quote is left
 * exactly as the customer received it.
 */
export async function PATCH(req: NextRequest, { params }: Context): Promise<Response> {
  const { jobId } = await params;
  let body: { businessId?: string; findingId?: string; note?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { businessId, findingId } = body;
  if (!businessId || typeof findingId !== "string" || !findingId || typeof body.note !== "string") {
    return NextResponse.json({ error: "businessId, findingId and note required" }, { status: 400 });
  }
  const note = body.note.trim();
  if (!validFindingNote(note)) {
    return NextResponse.json({ error: `A comment can be up to ${FINDING_NOTE_MAX} characters, with no < or >` }, { status: 400 });
  }
  const loaded = await load(req, jobId, businessId, true);
  if (!loaded.ok) return loaded.response;

  const jobRef = loaded.db.collection(`businesses/${businessId}/jobs`).doc(jobId);
  const withNote = (finding: JobFinding): JobFinding => {
    const next = { ...finding };
    if (note) next.note = note; else delete next.note;
    return next;
  };
  const outcome = await loaded.db.runTransaction(async (tx) => {
    const fresh = (await tx.get(jobRef)).data() as Job | undefined;
    const findings = fresh?.findings ?? [];
    if (!findings.some((f) => f.findingId === findingId)) return { missing: true as const };
    const quoteRef = fresh?.quoteId ? loaded.db.collection(`businesses/${businessId}/quotes`).doc(fresh.quoteId) : null;
    const quote = quoteRef ? (await tx.get(quoteRef)).data() as JobQuote | undefined : undefined;
    const now = Date.now();
    tx.update(jobRef, { findings: findings.map((f) => (f.findingId === findingId ? withNote(f) : f)), updatedAt: now });
    if (quoteRef && quote?.status === "draft" && quote.findings?.some((f) => f.findingId === findingId)) {
      tx.update(quoteRef, { findings: quote.findings.map((f) => (f.findingId === findingId ? withNote(f) : f)), updatedAt: now });
    }
    return { ok: true as const };
  });
  if ("missing" in outcome) return NextResponse.json({ error: "Finding not found on this job" }, { status: 404 });
  return NextResponse.json({ findingId, note: note || null });
}
