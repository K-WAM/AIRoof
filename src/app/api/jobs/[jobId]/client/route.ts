import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { buildMatchKey, buildSearchTokens } from "@/lib/customers/search";
import type { Customer, CustomerContact } from "@/types/customer";
import type { Job } from "@/types/jobs";

// PATCH /api/jobs/[jobId]/client — the office corrects who a job is for (name, phone, email, address).
//
// The address the AI takes on the call becomes the quote's and invoice's bill-to, so the office must be able to fix it
// (owner request 2026-09-28). One save updates, together:
//   - the job's snapshot fields (clientName / clientPhone / clientEmail / address),
//   - the linked customer record (so the next job for them starts right), with matchKey/searchTokens recomputed the same
//     way the Customers screen does,
//   - a DRAFT quote's and a DRAFT invoice's billTo.
// Refused once the invoice has been sent: a document the customer already has must never change underneath them (the
// same "frozen snapshot" rule as PATCH /customers/[id]?propagate=true).

const LIMITS = { name: 120, phone: 40, email: 200, address: 300 } as const;
type Field = keyof typeof LIMITS;
const UNSAFE = /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(body: Record<string, unknown>): { values: Partial<Record<Field, string>> } | { error: string } {
  const values: Partial<Record<Field, string>> = {};
  for (const field of Object.keys(LIMITS) as Field[]) {
    const raw = body[field];
    if (raw === undefined) continue;
    if (typeof raw !== "string" || raw.length > LIMITS[field] || UNSAFE.test(raw)) return { error: `Invalid ${field}` };
    values[field] = raw.trim();
  }
  if (values.email && !EMAIL.test(values.email)) return { error: "That email address does not look right" };
  if (values.name !== undefined && !values.name) return { error: "The customer needs a name" };
  if (Object.keys(values).length === 0) return { error: "Nothing to change" };
  return { values };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const businessId = typeof body.businessId === "string" ? body.businessId : "";
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const parsed = clean(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { values } = parsed;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const base = db.collection("businesses").doc(businessId);
  const jobRef = base.collection("jobs").doc(jobId);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const job = jobSnap.data() as Job;

  const invoiceSnap = job.invoiceId ? await base.collection("invoices").doc(job.invoiceId).get() : null;
  const invoiceStatus = invoiceSnap?.data()?.status as string | undefined;
  if (job.status === "invoiced" || (invoiceStatus && invoiceStatus !== "draft")) {
    return NextResponse.json({ error: "The invoice has been sent, so this job's customer details are locked. Change them on the customer instead." }, { status: 409 });
  }

  const now = Date.now();
  const next = {
    name: values.name ?? job.clientName ?? "",
    phone: values.phone !== undefined ? values.phone : job.clientPhone ?? "",
    email: values.email !== undefined ? values.email : job.clientEmail ?? "",
    address: values.address !== undefined ? values.address : job.address ?? "",
  };

  const batch = db.batch();
  batch.update(jobRef, {
    clientName: next.name,
    clientPhone: next.phone || null,
    clientEmail: next.email || null,
    address: next.address || null,
    updatedAt: now,
  });

  const billTo = { name: next.name, ...(next.email ? { email: next.email } : {}), ...(next.phone ? { phone: next.phone } : {}), ...(next.address ? { address: next.address } : {}) };
  const quoteSnap = job.quoteId ? await base.collection("quotes").doc(job.quoteId).get() : null;
  const updatedQuote = quoteSnap?.exists && quoteSnap.data()?.status === "draft";
  if (updatedQuote) batch.update(quoteSnap!.ref, { billTo, updatedAt: now });
  const updatedInvoice = Boolean(invoiceSnap?.exists && invoiceStatus === "draft");
  if (updatedInvoice) batch.update(invoiceSnap!.ref, { billTo, updatedAt: now });

  let updatedCustomer = false;
  if (job.customerId) {
    const customerRef = base.collection("customers").doc(job.customerId);
    const customerSnap = await customerRef.get();
    if (customerSnap.exists) {
      const current = customerSnap.data() as Customer;
      batch.update(customerRef, {
        name: next.name,
        phone: next.phone || null,
        email: next.email || null,
        address: next.address || null,
        matchKey: buildMatchKey({ name: next.name, phone: next.phone }),
        searchTokens: buildSearchTokens({ name: next.name, phone: next.phone, address: next.address, contacts: current.contacts as CustomerContact[] | undefined }),
        updatedAt: now,
      });
      updatedCustomer = true;
    }
  }

  await batch.commit();
  return NextResponse.json({
    client: { clientName: next.name, clientPhone: next.phone || undefined, clientEmail: next.email || undefined, address: next.address || undefined },
    updated: { customer: updatedCustomer, quote: Boolean(updatedQuote), invoice: updatedInvoice },
  });
}
