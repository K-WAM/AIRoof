// Persisted job invoices (Phase 12, Phase 4). Previously this route built a draft and returned
// it without ever writing it anywhere — "dead" per the plan doc, since nothing called it; the
// job detail page built invoice rows as pure ephemeral React state instead, discarded the moment
// the tab closed. Rewritten, not deleted: this is now the one place an invoice is created,
// fetched, or edited.

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { allocateJobInvoiceNumber } from "@/lib/billing/jobInvoiceNumber";
import { buildDraftFromProjection, computeTotals } from "@/app/company/jobs/[jobId]/jobInvoice";
import type { JobInvoice, InvoiceLaborLine, InvoiceMaterialLine, InvoiceOtherLine, JobInvoiceDiscount } from "@/types/invoice";
import type { Job } from "@/types/jobs";
import type { LibraryPricing } from "@/types/library";
import type { Customer } from "@/types/customer";
import { addFindingsToInvoice, validFindings } from "@/lib/jobs/findings";
import { getVerticalTemplate } from "@/lib/verticals/templates";

async function rebuildDraft(db: FirebaseFirestore.Firestore, businessId: string, job: Job) {
  const [bizSnap, customerSnap, librarySnap] = await Promise.all([
    db.collection("businesses").doc(businessId).get(),
    job.customerId ? db.collection(`businesses/${businessId}/customers`).doc(job.customerId).get() : Promise.resolve(null),
    db.collection(`businesses/${businessId}/library`).doc("pricing").get(),
  ]);
  const biz = bizSnap.data();
  const customer = customerSnap?.exists ? (customerSnap.data() as Customer) : null;
  const library = librarySnap.exists ? (librarySnap.data() as LibraryPricing) : null;

  const draft = buildDraftFromProjection({
    parsed: job.parsed ?? { timeline: [], materials: [], labor: [], issues: [], invoiceSuggestions: [] },
    library,
    businessConfig: biz ? { laborRate: biz.laborRate, defaultTaxRate: biz.defaultTaxRate } : null,
    customer,
  });
  return { draft, totals: computeTotals(draft) };
}

// GET /api/jobs/[jobId]/invoice?businessId=xxx — fetch the job's saved invoice, if any
export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "viewer", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const jobSnap = await db.collection(`businesses/${businessId}/jobs`).doc(jobId).get();
  const invoiceId = jobSnap.data()?.invoiceId;
  if (!invoiceId) return NextResponse.json({ invoice: null });

  const invSnap = await db.collection(`businesses/${businessId}/invoices`).doc(invoiceId).get();
  if (!invSnap.exists) return NextResponse.json({ invoice: null });

  return NextResponse.json({ invoice: { invoiceId: invSnap.id, ...invSnap.data() } as JobInvoice });
}

// POST /api/jobs/[jobId]/invoice — create the (one) invoice for this job from its current
// projection. Allocates a job-scoped invoice number, writes the invoice doc, and in the same
// WriteBatch sets job.invoiceId + job.status = "invoiced" — closing the dangling field.
// body: { businessId, force? } — force rebuilds a still-draft invoice's labor/materials/other
// from the CURRENT projection ("Regenerate" after new field updates came in), refusing once the
// invoice has been sent (same immutability rule PATCH enforces).
export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const body = await req.json();
  const { businessId, force } = body;
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const jobRef = db.collection(`businesses/${businessId}/jobs`).doc(jobId);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const job = jobSnap.data() as Job;

  // Re-use the existing invoice rather than minting a second one for the same job — "Generate
  // Invoice" is idempotent from the caller's point of view even if clicked twice. `force`
  // rebuilds it in place instead (see the route comment above).
  if (job.invoiceId) {
    const existingRef = db.collection(`businesses/${businessId}/invoices`).doc(job.invoiceId);
    const existing = await existingRef.get();
    if (existing.exists) {
      const existingInvoice = existing.data() as JobInvoice;
      if (!force) return NextResponse.json({ invoice: existingInvoice });
      if (existingInvoice.status !== "draft") {
        return NextResponse.json({ error: `Invoice is ${existingInvoice.status} and can no longer be regenerated` }, { status: 409 });
      }
      const rebuilt = await rebuildDraft(db, businessId, job);
      const patch = { ...rebuilt.draft, ...rebuilt.totals, updatedAt: Date.now() };
      await existingRef.update(patch);
      return NextResponse.json({ invoice: { ...existingInvoice, ...patch } });
    }
  }

  const { draft, totals } = await rebuildDraft(db, businessId, job);
  const invoiceId = await allocateJobInvoiceNumber(db, businessId);
  const now = Date.now();
  const invoice: JobInvoice = {
    invoiceId,
    businessId,
    jobId,
    customerId: job.customerId,
    billTo: { name: job.clientName ?? "", phone: job.clientPhone, email: job.clientEmail, address: job.address },
    status: "draft",
    ...draft,
    hideMaterials: false,
    ...totals,
    createdAt: now,
    updatedAt: now,
    createdBy: gate.user.uid,
  };

  const batch = db.batch();
  batch.set(db.collection(`businesses/${businessId}/invoices`).doc(invoiceId), invoice);
  batch.update(jobRef, { invoiceId, status: "invoiced", updatedAt: now });
  await batch.commit();

  return NextResponse.json({ invoice }, { status: 201 });
}

interface PatchBody {
  businessId?: string;
  addFindings?: boolean;
  labor?: InvoiceLaborLine[];
  materials?: InvoiceMaterialLine[];
  other?: InvoiceOtherLine[];
  taxRate?: number;
  hideMaterials?: boolean;
  notes?: string;
  discount?: JobInvoiceDiscount | null;
}

// PATCH /api/jobs/[jobId]/invoice — edit a draft invoice's rows/settings and recompute totals
// with the exact same computeTotals the client's live preview uses, so they can never drift.
// Refuses once the invoice has been sent — a sent invoice is immutable (void + reissue instead).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const body = (await req.json()) as PatchBody;
  const { businessId } = body;
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const jobSnap = await db.collection(`businesses/${businessId}/jobs`).doc(jobId).get();
  const invoiceId = jobSnap.data()?.invoiceId;
  if (!invoiceId) return NextResponse.json({ error: "No invoice exists for this job yet" }, { status: 404 });

  const invRef = db.collection(`businesses/${businessId}/invoices`).doc(invoiceId);
  const invSnap = await invRef.get();
  if (!invSnap.exists) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const current = invSnap.data() as JobInvoice;

  if (current.status !== "draft") {
    return NextResponse.json({ error: `Invoice is ${current.status} and can no longer be edited` }, { status: 409 });
  }

  if (body.addFindings !== undefined) {
    if (body.addFindings !== true || Object.keys(body).some((key) => !["businessId", "addFindings"].includes(key))) {
      return NextResponse.json({ error: "Invalid addFindings request" }, { status: 400 });
    }
    const job = jobSnap.data() as Job;
    if (!validFindings(job.findings ?? [])) return NextResponse.json({ error: "Invalid job findings" }, { status: 409 });
    const [bizSnap, librarySnap] = await Promise.all([
      db.collection("businesses").doc(businessId).get(),
      db.collection(`businesses/${businessId}/library`).doc("pricing").get(),
    ]);
    if (getVerticalTemplate(bizSnap.data()?.industry ?? "").disabledModules.includes("jobs")) {
      return NextResponse.json({ error: "Jobs module unavailable" }, { status: 403 });
    }
    const merged = addFindingsToInvoice(current, job.findings ?? [], librarySnap.exists ? librarySnap.data() as LibraryPricing : null);
    const patch = { labor: merged.labor, materials: merged.materials, other: merged.other,
      laborSubtotal: merged.laborSubtotal, materialSubtotal: merged.materialSubtotal, otherSubtotal: merged.otherSubtotal,
      subtotal: merged.subtotal, taxAmount: merged.taxAmount, total: merged.total, updatedAt: Date.now() };
    await invRef.update(patch);
    return NextResponse.json({ invoice: { ...current, ...patch } });
  }

  const merged: Pick<JobInvoice, "labor" | "materials" | "other" | "taxRate" | "discount"> = {
    labor: body.labor ?? current.labor,
    materials: body.materials ?? current.materials,
    other: body.other ?? current.other,
    taxRate: body.taxRate ?? current.taxRate,
    discount: body.discount === null ? undefined : body.discount ?? current.discount,
  };
  const totals = computeTotals(merged);

  const patch: Partial<JobInvoice> = {
    ...merged,
    ...totals,
    updatedAt: Date.now(),
    ...(body.hideMaterials !== undefined ? { hideMaterials: body.hideMaterials } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
  };
  await invRef.update(patch);

  return NextResponse.json({ invoice: { ...current, ...patch } });
}
