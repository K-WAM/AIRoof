import { NextRequest } from "next/server";
import { verifyOwnBusinessOrSuperadmin } from "@/lib/auth/verifyRole";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { companiesOf, isMultiCompany, resolveDocumentCompany } from "@/lib/companies/companies";
import { documentLetterhead } from "@/lib/companies/documentLetterhead";
import { refreshGeneratedText, type InvoiceCopyValues } from "@/lib/companies/documentCopy";
import { sendLockActive } from "@/lib/billing/jobInvoiceStore";
import { jsonWithCache } from "@/lib/http/cache";
import { loadLetter } from "@/lib/documents/letterStore";
import { invoiceOpeningText, depositOpeningText } from "@/lib/companies/documentOpening";
import { fillInvoiceCopy, DEFAULT_INVOICE_COPY } from "@/lib/documents/invoiceCopy";
import { draftQuoteIntro } from "@/lib/billing/draftQuoteIntro";
import { getVerticalTemplate } from "@/lib/verticals/templates";
import { fmtDate } from "@/lib/format";
import type { Job } from "@/types/jobs";
import type { JobInvoice } from "@/types/invoice";
import type { JobQuote } from "@/types/quote";
import type { Customer } from "@/types/customer";
import type { BillingCompany, DocumentCompanyCopy } from "@/types/company";

type CopyPatch = DocumentCompanyCopy;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const body = await req.json().catch(() => null);
  // A member switches their own business's documents; the platform admin names the business (Demo Studio / Preview).
  const gate = await verifyOwnBusinessOrSuperadmin(req, body?.businessId, ["owner", "staff"]);
  if ("error" in gate) return gate.error;
  if (!body || !["quote", "invoice", "deposit", "report"].includes(body.kind) || typeof body.companyId !== "string") return jsonWithCache({ error: "Choose a document and company." }, "noStore", { status: 400 });
  if (body.kind === "deposit" && (typeof body.invoiceId !== "string" || !/^[\w-]{1,128}$/.test(body.invoiceId))) return jsonWithCache({ error: "Document not found" }, "noStore", { status: 404 });
  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Database unavailable" }, "noStore", { status: 503 });
  const { jobId } = await params, businessId = gate.user.businessId!;
  // Templates are read before the transaction (Firestore allows reads before, never after, the first write).
  const letterTemplate = body.kind === "invoice" ? await loadLetter(db, businessId, "invoice_opening") : body.kind === "deposit" ? await loadLetter(db, businessId, "deposit_opening") : null;
  const jobRef = db.collection(`businesses/${businessId}/jobs`).doc(jobId);
  const result = await db.runTransaction(async tx => {
    const [bizSnap, jobSnap] = await Promise.all([tx.get(db.collection("businesses").doc(businessId)), tx.get(jobRef)]);
    if (!jobSnap.exists) return { error: "Job not found", status: 404 };
    const biz = bizSnap.data() ?? {}, job = jobSnap.data()!;
    if (!isMultiCompany(biz)) return { ok: true }; // No new stored field for single-company businesses.
    const companies = companiesOf(biz);
    const nextCompany = companies.find(c => c.id === body.companyId);
    if (!nextCompany) return { error: "Company not found", status: 400 };
    let copy: CopyPatch = {};
    if (body.kind === "report") {
      if (job.reportDocument?.sentAt || sendLockActive(job.reportCompanySendClaim)) return { error: "A sent report keeps its company.", status: 409 };
      tx.update(jobRef, { reportDocument: { ...job.reportDocument, companyId: body.companyId }, updatedAt: Date.now() });
    } else {
      // Deposits never set job.invoiceId (that pointer is the standard invoice's), so the posted id is the only one.
      const id = body.kind === "quote" ? job.quoteId : body.kind === "invoice" ? job.invoiceId : body.invoiceId;
      if (typeof id !== "string" || !/^[\w-]{1,128}$/.test(id)) return { error: "Document not found", status: 404 };
      const ref = db.collection(`businesses/${businessId}/${body.kind === "quote" ? "quotes" : "invoices"}`).doc(id);
      const doc = (await tx.get(ref)).data();
      if (!doc || doc.jobId !== jobId || doc.businessId !== businessId || (body.kind === "deposit" ? doc.kind !== "deposit" : body.kind === "invoice" && doc.kind === "deposit")) return { error: "Document not found", status: 404 };
      if (doc.status !== "draft" || sendLockActive(doc.companySendClaim) || sendLockActive(job.documentSendLock)) return { error: "Only a draft document's company can be changed.", status: 409 };
      const customerSnap = job.customerId ? await tx.get(db.collection(`businesses/${businessId}/customers`).doc(job.customerId)) : null;
      const customer = customerSnap?.data() as Customer | undefined;
      const oldCompany = resolveDocumentCompany(biz, { documentCompanyId: doc.companyId, jobCompanyId: job.companyId, customerCompanyId: customer?.companyId });
      const names = companies.map(c => c.name);
      const brandFor = (company: BillingCompany | null) => documentLetterhead(biz, company);
      if (body.kind === "quote") {
        const quote = doc as JobQuote;
        copy.narrative = refreshGeneratedText(quote.narrative, names, nextCompany.name, name => draftQuoteIntro(job as Job, quote.findings ?? [], name));
      } else if ((doc as JobInvoice).kind === "deposit") {
        const invoice = doc as JobInvoice;
        copy.opening = refreshGeneratedText(invoice.opening, names, nextCompany.name, name => depositOpeningText(letterTemplate!, job as Job, customer, name, invoice, biz));
      } else {
        const invoice = doc as JobInvoice;
        const quoteSnap = job.quoteId ? await tx.get(db.collection(`businesses/${businessId}/quotes`).doc(job.quoteId)) : null;
        const acceptedQuote = quoteSnap?.data()?.status === "accepted" ? quoteSnap.data() as JobQuote : null;
        const brands = new Map(companies.map(company => [company.name, brandFor(company)] as const));
        if (oldCompany && !brands.has(oldCompany.name)) brands.set(oldCompany.name, brandFor(oldCompany));
        copy.opening = refreshGeneratedText(invoice.opening, names, nextCompany.name, name => invoiceOpeningText(letterTemplate!, job as Job, customer, name, brands.get(name)?.licenseNumber, invoice, biz, acceptedQuote));
        const values = (): InvoiceCopyValues => ({
          address: job.address ?? "the service address",
          visitDate: fmtDate(job.scheduledStart ?? job.createdAt ?? invoice.createdAt, biz.timezone ?? "America/New_York"),
          industryNoun: getVerticalTemplate(biz.industry ?? "").vocab.jobNoun,
        });
        const invoiceCopy = biz.invoiceCopy ?? {};
        const generated = (name: string) => {
          const filled = { businessName: name, ...values() };
          return {
            closing: fillInvoiceCopy(invoiceCopy.closing ?? DEFAULT_INVOICE_COPY.closing, filled),
            thankYou: fillInvoiceCopy(invoiceCopy.thankYou ?? DEFAULT_INVOICE_COPY.thankYou, filled),
          };
        };
        copy.closing = refreshGeneratedText(invoice.closing, names, nextCompany.name, name => generated(name).closing);
        copy.thankYou = refreshGeneratedText(invoice.thankYou, names, nextCompany.name, name => generated(name).thankYou);
      }
      copy = Object.fromEntries(Object.entries(copy).filter(([, value]) => value !== undefined)) as CopyPatch;
      tx.update(ref, { companyId: body.companyId, ...copy, updatedAt: Date.now() });
    }
    tx.set(jobRef.collection("auditEvents").doc(), { action: "document.company.changed", actorUid: gate.user.uid, businessId, jobId, kind: body.kind, companyId: body.companyId, createdAt: Date.now() });
    return { ok: true, companyId: body.companyId, ...(Object.keys(copy).length ? { copy } : {}) };
  });
  return jsonWithCache("error" in result ? { error: result.error } : result, "noStore", { status: "error" in result ? result.status : 200 });
}
