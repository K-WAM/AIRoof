import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { getVerticalTemplate } from "@/lib/verticals/templates";
import { allocateJobQuoteNumber } from "@/lib/billing/jobQuoteNumber";
import { quoteLinesFromFindings, quoteTotal, nextQuoteStatus, validQuoteLines } from "@/lib/billing/jobQuote";
import { validFindings } from "@/lib/jobs/findings";
import type { Job } from "@/types/jobs";
import type { JobQuote, QuoteStatus } from "@/types/quote";

type Context = { params: Promise<{ jobId: string }> };
const err = (message: string, status: number) => NextResponse.json({ error: message }, { status });
async function jobsEnabled(db: FirebaseFirestore.Firestore, businessId: string) {
  const biz = await db.collection("businesses").doc(businessId).get();
  return biz.exists && !getVerticalTemplate(biz.data()?.industry ?? "").disabledModules.includes("jobs");
}
async function jobAndQuote(db: FirebaseFirestore.Firestore, businessId: string, jobId: string) {
  const jobRef = db.collection(`businesses/${businessId}/jobs`).doc(jobId);
  const jobSnap = await jobRef.get();
  const job = jobSnap.exists ? jobSnap.data() as Job : null;
  const quoteRef = job?.quoteId ? db.collection(`businesses/${businessId}/quotes`).doc(job.quoteId) : null;
  const quoteSnap = quoteRef ? await quoteRef.get() : null;
  return { jobRef, job, quoteRef, quote: quoteSnap?.exists ? quoteSnap.data() as JobQuote : null };
}

export async function GET(req: NextRequest, { params }: Context) {
  const { jobId } = await params;
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (typeof businessId !== "string" || !businessId) return err("businessId required", 400);
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "viewer", "superadmin"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return err("Database unavailable", 503);
  if (!await jobsEnabled(db, businessId)) return err("Jobs module unavailable", 403);
  const { job, quote } = await jobAndQuote(db, businessId, jobId);
  if (!job) return err("Job not found", 404);
  return jsonWithCache({ quote }, "noStore");
}

export async function POST(req: NextRequest, { params }: Context) {
  const { jobId } = await params;
  let body: { businessId?: string };
  try { body = await req.json(); } catch { return err("Invalid JSON", 400); }
  const { businessId } = body;
  if (typeof businessId !== "string" || !businessId) return err("businessId required", 400);
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return err("Database unavailable", 503);
  if (!await jobsEnabled(db, businessId)) return err("Jobs module unavailable", 403);
  const { jobRef, job, quote } = await jobAndQuote(db, businessId, jobId);
  if (!job) return err("Job not found", 404);
  if (quote) return NextResponse.json({ quote });
  if (!validFindings(job.findings ?? [])) return err("Invalid job findings", 409);
  const now = Date.now();
  const quoteId = await allocateJobQuoteNumber(db, businessId);
  const findings = (job.findings ?? []).filter((f) => f.includeInQuote).map((f) => ({ ...f, lines: f.lines?.map((line) => ({ ...line })) }));
  const lines = quoteLinesFromFindings(findings);
  const newQuote: JobQuote = {
    quoteId, businessId, jobId, customerId: job.customerId,
    billTo: { name: job.clientName ?? "", email: job.clientEmail, phone: job.clientPhone, address: job.address },
    findings, lines, status: "draft", hideMaterials: false, validUntil: now + 30 * 86400000,
    subtotal: quoteTotal(lines), total: quoteTotal(lines), createdAt: now, updatedAt: now, createdBy: gate.user.uid,
  };
  const batch = db.batch();
  batch.set(db.collection(`businesses/${businessId}/quotes`).doc(quoteId), newQuote);
  batch.update(jobRef, { quoteId, updatedAt: now });
  await batch.commit();
  return NextResponse.json({ quote: newQuote }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: Context) {
  const { jobId } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err("Invalid JSON", 400); }
  const businessId = body.businessId;
  if (typeof businessId !== "string" || !businessId) return err("businessId required", 400);
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return err("Database unavailable", 503);
  if (!await jobsEnabled(db, businessId)) return err("Jobs module unavailable", 403);
  const { job, quoteRef, quote } = await jobAndQuote(db, businessId, jobId);
  if (!job || !quoteRef || !quote) return err("Quote not found", 404);
  if (body.status !== undefined) {
    const next = body.status as QuoteStatus;
    if (!nextQuoteStatus(quote.status, next)) return err("Invalid quote status transition", 409);
    const patch = { status: next, updatedAt: Date.now() };
    await quoteRef.update(patch);
    return NextResponse.json({ quote: { ...quote, ...patch } });
  }
  if (quote.status !== "draft") return err("Only a draft quote can be edited", 409);
  if (body.lines !== undefined && !validQuoteLines(body.lines)) return err("Invalid quote lines", 400);
  if (body.findings !== undefined && !validFindings(body.findings)) return err("Invalid quote findings", 400);
  if (body.notes !== undefined && (typeof body.notes !== "string" || body.notes.length > 2000 || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.notes))) return err("Invalid notes", 400);
  if (body.hideMaterials !== undefined && typeof body.hideMaterials !== "boolean") return err("Invalid hideMaterials", 400);
  if (body.validUntil !== undefined && (typeof body.validUntil !== "number" || !Number.isFinite(body.validUntil) || body.validUntil <= Date.now() || body.validUntil > Date.now() + 10 * 365 * 86400000)) return err("Invalid validUntil", 400);
  const lines = (body.lines ?? quote.lines) as JobQuote["lines"];
  const total = quoteTotal(lines);
  const patch: Partial<JobQuote> = { updatedAt: Date.now(), subtotal: total, total,
    ...(body.lines !== undefined ? { lines } : {}),
    ...(body.findings !== undefined ? { findings: body.findings as JobQuote["findings"] } : {}),
    ...(body.notes !== undefined ? { notes: body.notes as string } : {}),
    ...(body.hideMaterials !== undefined ? { hideMaterials: body.hideMaterials as boolean } : {}),
    ...(body.validUntil !== undefined ? { validUntil: body.validUntil as number } : {}),
  };
  await quoteRef.update(patch);
  return NextResponse.json({ quote: { ...quote, ...patch } });
}
