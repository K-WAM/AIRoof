import { documentLetterhead } from "@/lib/companies/documentLetterhead";
import { resolveDocumentCompany } from "@/lib/companies/companies";
import { NextRequest } from "next/server";
import { verifyOwnBusinessOrSuperadmin } from "@/lib/auth/verifyRole";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { jsonWithCache } from "@/lib/http/cache";
import { depositAmount } from "@/lib/billing/jobInvoiceDeposits";
import { jobInvoices, sendLockActive } from "@/lib/billing/jobInvoiceStore";
import { customerTotals } from "@/lib/billing/jobCustomerTotals";
import { quoteTotal } from "@/lib/billing/jobQuote";
import { computeTotals } from "@/app/company/jobs/[jobId]/jobInvoice";
import { loadLetter } from "@/lib/documents/letterStore";
import { amountInWords, renderLetter } from "@/lib/documents/letters";
import { effectiveBillingPrefs } from "@/lib/billing/customerPayments";
import { fmtDate } from "@/lib/format";
import { fmtMoney } from "@/lib/format/money";
import type { JobInvoice } from "@/types/invoice";
import type { JobQuote } from "@/types/quote";
import type { Job } from "@/types/jobs";

const error = (message: string, status = 400) => jsonWithCache({ error: message }, "noStore", { status });
export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const gate = await verifyOwnBusinessOrSuperadmin(req, req.nextUrl.searchParams.get("businessId"), ["owner", "staff", "viewer"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore(); if (!db) return error("Database unavailable", 503);
  const { jobId } = await params;
  const snap = await jobInvoices(db, gate.user.businessId!, jobId).get();
  return jsonWithCache({ deposits: snap.docs.map(d => ({ ...d.data(), invoiceId: d.id }) as JobInvoice).filter(d => d.kind === "deposit") }, "volatile");
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const body = await req.json().catch(() => null);
  const gate = await verifyOwnBusinessOrSuperadmin(req, body?.businessId, ["owner", "staff"]);
  if ("error" in gate) return gate.error;
  if (!body || typeof body !== "object" || typeof body.requestId !== "string" || !/^[\w-]{8,100}$/.test(body.requestId)) return error("A deposit request id is required");
  const percent = body.percent ?? 50;
  try { depositAmount(1, percent); } catch { return error("Enter a deposit percent from 1 to 100"); }
  const agreementDate = body.agreementDate ?? Date.now();
  if (typeof agreementDate !== "number" || !Number.isFinite(agreementDate) || agreementDate < 0 || agreementDate > Date.now() + 86400000) return error("Invalid agreement date");
  const db = getAdminFirestore(); if (!db) return error("Database unavailable", 503);
  const { jobId } = await params, businessId = gate.user.businessId!;
  const jobRef = db.collection(`businesses/${businessId}/jobs`).doc(jobId), bizRef = db.collection("businesses").doc(businessId);
  const template = await loadLetter(db, businessId, "deposit_opening");
  try {
    const invoice = await db.runTransaction(async tx => {
      const jobSnap = await tx.get(jobRef), bizSnap = await tx.get(bizRef);
      if (!jobSnap.exists) throw new Error("Job not found");
      const job = jobSnap.data() as Job, biz = bizSnap.data() ?? {};
      const invoices = await tx.get(jobInvoices(db, businessId, jobId));
      const all = invoices.docs.map(d => ({ ...d.data(), invoiceId: d.id }) as JobInvoice);
      const previous = all.find(d => d.kind === "deposit" && d.depositRequestId === body.requestId);
      if (previous) return previous;
      if (sendLockActive(job.documentSendLock)) throw new Error("An invoice is being sent. Try again after it finishes.");
      if (all.some(d => d.kind !== "deposit" && (d.status === "sent" || d.status === "paid"))) throw new Error("The final invoice has been sent. A new deposit cannot be requested.");
      const quoteSnap = job.quoteId ? await tx.get(db.collection(`businesses/${businessId}/quotes`).doc(job.quoteId)) : null;
      const quote = quoteSnap?.data() as JobQuote | undefined;
      const basis = quote?.status === "accepted" ? customerTotals({ kind: "quote", lineSubtotal: quoteTotal(quote.lines ?? []), priceMode: quote.priceMode, customerSubtotal: quote.customerSubtotal }).total : body.basis;
      const amount = depositAmount(basis, percent);
      const alreadyRequested = all.filter(d => d.kind === "deposit" && d.status !== "void").reduce((sum, d) => sum + Math.round(d.total * 100), 0);
      if (amount <= 0 || alreadyRequested + Math.round(amount * 100) > Math.round(basis * 100)) throw new Error("Deposits cannot exceed the contract total. Void an unused draft first.");
      const customerSnap = job.customerId ? await tx.get(db.collection(`businesses/${businessId}/customers`).doc(job.customerId)) : null;
      const customer = customerSnap?.data();
      const counter = (biz.invoiceCounter ?? 999) + 1, invoiceId = `INV-${counter}`, now = Date.now();
      const documentBusiness = documentLetterhead(biz, resolveDocumentCompany(biz, { jobCompanyId: job.companyId, customerCompanyId: customer?.companyId }));
      const letter = renderLetter(template, { date: fmtDate(now, biz.timezone), "customer.name": job.clientName, "customer.code": customer?.customerCode,
        serviceAt: job.address, workOrder: jobId, description: job.title, agreementDate: fmtDate(agreementDate, biz.timezone),
        depositPercent: String(percent), depositAmount: fmtMoney(amount), price: fmtMoney(amount), priceWords: amountInWords(amount), "business.name": documentBusiness.businessName,
      }, { includeOptional: template.sections.filter(s => s.defaultOn).map(s => s.id) });
      const progressIndex = template.sections.filter(s => !s.optional || s.defaultOn).findIndex(s => s.id === "progress");
      const progress = progressIndex < 0 ? undefined : letter.blocks[progressIndex];
      const lines = { labor: [], materials: [], other: [{ lineId: "deposit", description: progress?.paragraphs.join(" ") || `Progress billing: ${percent}% complete`, amount }], taxRate: 0 };
      const next: JobInvoice = { invoiceId, businessId, jobId, customerId: job.customerId, kind: "deposit", depositRequestId: body.requestId,
        depositPercent: percent, depositBasis: basis, depositAgreementDate: agreementDate, status: "draft",
        billTo: { name: job.clientName ?? "", email: job.clientEmail, address: customer?.address ?? job.address }, serviceAt: job.address ?? "", description: job.title,
        ...(customer?.customerCode ? { customerCode: customer.customerCode } : {}),
        opening: letter.blocks.filter((_, i) => i !== progressIndex).flatMap(b => [...b.paragraphs, ...(b.bullets ?? [])]).join("\n"), issuedAt: now, dueAt: now + effectiveBillingPrefs(biz).dueDays * 86400000,
        hideMaterials: false, ...lines, ...computeTotals(lines), createdAt: now, updatedAt: now, createdBy: gate.user.uid };
      tx.update(bizRef, { invoiceCounter: counter });
      tx.set(db.collection(`businesses/${businessId}/invoices`).doc(invoiceId), next);
      // Deliberately never set job.invoiceId: that pointer is reserved for the standard invoice.
      return next;
    });
    return jsonWithCache({ invoice }, "noStore", { status: 201 });
  } catch (e) { return error(e instanceof Error ? e.message : "Could not create deposit", 409); }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const body = await req.json().catch(() => null);
  const gate = await verifyOwnBusinessOrSuperadmin(req, body?.businessId, ["owner", "staff"]);
  if ("error" in gate) return gate.error;
  if (!body || typeof body.invoiceId !== "string" || body.status !== "void") return error("Choose a deposit to void");
  const db = getAdminFirestore(); if (!db) return error("Database unavailable", 503);
  const { jobId } = await params, businessId = gate.user.businessId!;
  try {
    await db.runTransaction(async tx => {
      const job = await tx.get(db.collection(`businesses/${businessId}/jobs`).doc(jobId));
      const ref = db.collection(`businesses/${businessId}/invoices`).doc(body.invoiceId), snap = await tx.get(ref);
      const invoice = snap.data() as JobInvoice | undefined;
      if (!invoice || invoice.kind !== "deposit" || invoice.jobId !== jobId) throw new Error("Deposit not found");
      if (sendLockActive(job.data()?.documentSendLock)) throw new Error("An invoice is being sent. Try again after it finishes.");
      if ((invoice.amountPaid ?? 0) > 0 || invoice.status === "paid") throw new Error("A deposit with payments cannot be voided.");
      tx.update(ref, { status: "void", updatedAt: Date.now() });
    });
    return jsonWithCache({ ok: true }, "noStore");
  } catch (e) { return error(e instanceof Error ? e.message : "Could not void deposit", 409); }
}
