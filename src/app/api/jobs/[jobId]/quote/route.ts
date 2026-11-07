import { sendLockActive } from "@/lib/billing/jobInvoiceStore";
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { getVerticalTemplate } from "@/lib/verticals/templates";
import { allocateJobQuoteNumber } from "@/lib/billing/jobQuoteNumber";
import { quoteLinesFromFindings, quoteTotal, nextQuoteStatus, validQuoteLines } from "@/lib/billing/jobQuote";
import { DEFAULT_QUOTE_NOTES } from "@/lib/billing/draftQuoteIntro";
import { validFindings } from "@/lib/jobs/findings";
import type { Job } from "@/types/jobs";
import type { JobQuote, QuoteStatus } from "@/types/quote";
import { validNarrative, validTechnicians } from "@/lib/documents/validation";
import { loadDocumentPhotos } from "@/lib/documents/photoSelection";
import { customerTotals, validCustomerSubtotal } from "@/lib/billing/jobCustomerTotals";
import { validLogoSelection } from "@/lib/documents/logoSelection";
import { inheritSampleProvenance } from "@/types/provenance";

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
  const customer = job.customerId ? (await db.collection(`businesses/${businessId}/customers`).doc(job.customerId).get()).data() : null;
  const newQuote: JobQuote = {
    quoteId, businessId, jobId, ...inheritSampleProvenance(job, "Quote", now), customerId: job.customerId,
    serviceAt: job.address ?? "", description: job.title ?? "", ...(customer?.customerCode ? { customerCode: customer.customerCode } : {}),
    billTo: { name: job.clientName ?? "", email: job.clientEmail, phone: job.clientPhone, address: customer?.address ?? job.address },
    findings, lines, status: "draft", hideMaterials: false, validUntil: now + 30 * 86400000, notes: DEFAULT_QUOTE_NOTES,
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
    const now = Date.now();
    // answeredAt: the "Accepted on Sep 25" the office sees; updatedAt alone moves with any later write.
    const patch = { status: next, answeredAt: now, updatedAt: now };
    await quoteRef.update(patch);
    return NextResponse.json({ quote: { ...quote, ...patch } });
  }
  if (quote.status !== "draft") return err("Only a draft quote can be edited", 409);
  if (body.logoId !== undefined && !await validLogoSelection(db, businessId, body.logoId)) return err("Invalid letterhead logo", 400);
  if (body.layout !== undefined && !["itemized", "proposal", "tm_authorization"].includes(body.layout as string)) return err("Invalid layout", 400);
  if (body.includeOptional !== undefined && (!Array.isArray(body.includeOptional) || body.includeOptional.length > 20 || body.includeOptional.some(id => typeof id !== "string" || !/^[\w-]{1,80}$/.test(id)))) return err("Invalid optional sections", 400);
  for (const key of ["serviceAt", "attention", "description", "poNumber"] as const) {
    if (body[key] !== undefined && (typeof body[key] !== "string" || (body[key] as string).length > 1000)) return err(`Invalid ${key}`, 400);
  }
  if (body.lines !== undefined && !validQuoteLines(body.lines)) return err("Invalid quote lines", 400);
  if (body.findings !== undefined && !validFindings(body.findings)) return err("Invalid quote findings", 400);
  if (body.notes !== undefined && (typeof body.notes !== "string" || body.notes.length > 2000 || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.notes))) return err("Invalid notes", 400);
  if (body.hideMaterials !== undefined && typeof body.hideMaterials !== "boolean") return err("Invalid hideMaterials", 400);
  if (body.hideLabor !== undefined && typeof body.hideLabor !== "boolean") return err("Invalid hideLabor", 400);
  if (body.priceMode !== undefined && body.priceMode !== "lines" && body.priceMode !== "project") return err("Invalid priceMode", 400);
  if (body.customerSubtotal !== undefined && !validCustomerSubtotal(body.customerSubtotal)) return err("Invalid customerSubtotal", 400);
  if (body.adjustmentNote !== undefined && (typeof body.adjustmentNote !== "string" || body.adjustmentNote.length > 1000 || /[<>\u0000-\u001f]/.test(body.adjustmentNote))) return err("Invalid adjustmentNote", 400);
  if (body.showTechnicians !== undefined && typeof body.showTechnicians !== "boolean") return err("Invalid showTechnicians", 400);
  if (body.technicians !== undefined && !validTechnicians(body.technicians)) return err("Invalid technicians", 400);
  if (body.narrative !== undefined && !validNarrative(body.narrative)) return err("Invalid narrative", 400);
  if (body.photoIds !== undefined) {
    const selected = await loadDocumentPhotos(db, businessId, jobId, body.photoIds);
    if ("error" in selected) return err(selected.error, 400);
  }
  if (body.validUntil !== undefined && (typeof body.validUntil !== "number" || !Number.isFinite(body.validUntil) || body.validUntil <= Date.now() || body.validUntil > Date.now() + 10 * 365 * 86400000)) return err("Invalid validUntil", 400);
  const lines = (body.lines ?? quote.lines) as JobQuote["lines"];
  const priceMode = (body.priceMode ?? quote.priceMode ?? "lines") as "lines" | "project";
  const customerSubtotal = body.customerSubtotal === undefined ? quote.customerSubtotal : body.customerSubtotal as number;
  if (priceMode === "project" && !validCustomerSubtotal(customerSubtotal)) return err("Project price requires a valid customer subtotal", 400);
  const totals = customerTotals({ kind: "quote", lineSubtotal: quoteTotal(lines), priceMode, customerSubtotal });
  const patch: Partial<JobQuote> = { updatedAt: Date.now(), subtotal: totals.subtotal, total: totals.total, calculatedSubtotal: totals.calculatedSubtotal,
    ...(body.logoId !== undefined ? { logoId: body.logoId as string | null } : {}),
    ...(body.layout !== undefined ? { layout: body.layout as JobQuote["layout"] } : {}),
    ...(body.includeOptional !== undefined ? { includeOptional: body.includeOptional as string[] } : {}),
    ...Object.fromEntries(["serviceAt", "attention", "description", "poNumber"].filter(k => body[k] !== undefined).map(k => [k, body[k]])),
    priceMode,
    ...(priceMode === "project" ? { customerSubtotal } : {}),
    ...(body.adjustmentNote !== undefined ? { adjustmentNote: body.adjustmentNote as string } : {}),
    ...(body.lines !== undefined ? { lines } : {}),
    ...(body.findings !== undefined ? { findings: body.findings as JobQuote["findings"] } : {}),
    ...(body.notes !== undefined ? { notes: body.notes as string } : {}),
    ...(body.hideMaterials !== undefined ? { hideMaterials: body.hideMaterials as boolean } : {}),
    ...(body.hideLabor !== undefined ? { hideLabor: body.hideLabor as boolean } : {}),
    ...(body.showTechnicians !== undefined ? { showTechnicians: body.showTechnicians as boolean } : {}),
    ...(body.technicians !== undefined ? { technicians: body.technicians as string[] } : {}),
    ...(body.narrative !== undefined ? { narrative: body.narrative as string } : {}),
    ...(body.photoIds !== undefined ? { photoIds: body.photoIds as string[] } : {}),
    ...(body.validUntil !== undefined ? { validUntil: body.validUntil as number } : {}),
  };
  const saved = await db.runTransaction(async tx => {
    const fresh = (await tx.get(quoteRef)).data();
    if (!fresh || fresh.status !== "draft" || sendLockActive(fresh.companySendClaim)) return false;
    tx.update(quoteRef, patch);
    return true;
  });
  if (!saved) return err("Quote changed or is being sent. Reload before editing.", 409);
  return NextResponse.json({ quote: { ...quote, ...patch } });
}
