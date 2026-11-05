import type { BillingCompany } from "@/types/company";
import { companiesOf, isMultiCompany, resolveDocumentCompany } from "./companies";

type Business = { billingCompanies?: unknown };
type JobCompany = { companyId?: unknown; customerId?: string };
type DocumentCompanyRecord = { companyId?: unknown; status?: unknown; sentAt?: unknown };

/** A report's "sent" marker is sentAt; invoices/quotes/deposits carry status. */
function documentStatus(document: DocumentCompanyRecord | null | undefined): unknown {
  if (!document) return undefined;
  if (document.status !== undefined) return document.status;
  return document.sentAt ? "sent" : undefined;
}

/** Reads a customer only when a draft has neither its own nor its job's company. Always scoped to this tenant. */
export async function loadDocumentCompany(db: FirebaseFirestore.Firestore, businessId: string, business: Business, document: DocumentCompanyRecord | null | undefined, job: JobCompany): Promise<BillingCompany | null> {
  return readDocumentCompany(db, businessId, business, document, job);
}

/** Transaction variant used by send claims: the chosen company cannot race the job/customer reads. */
export async function readDocumentCompany(db: FirebaseFirestore.Firestore, businessId: string, business: Business, document: DocumentCompanyRecord | null | undefined, job: JobCompany, tx?: FirebaseFirestore.Transaction): Promise<BillingCompany | null> {
  if (!isMultiCompany(business)) return null;
  const known = companiesOf(business);
  const status = documentStatus(document);
  const frozen = typeof status === "string" && status !== "draft";
  const hasKnown = [document?.companyId, job.companyId].some(id => known.some(c => c.id === id));
  let customerCompanyId: unknown;
  if (!hasKnown && !frozen && job.customerId) {
    const ref = db.collection(`businesses/${businessId}/customers`).doc(job.customerId);
    customerCompanyId = (await (tx ? tx.get(ref) : ref.get())).data()?.companyId;
  }
  return resolveDocumentCompany(business, { documentCompanyId: document?.companyId, jobCompanyId: job.companyId, customerCompanyId, documentStatus: status });
}
