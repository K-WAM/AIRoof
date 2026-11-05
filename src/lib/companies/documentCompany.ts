import type { BillingCompany } from "@/types/company";
import { companiesOf, isMultiCompany, resolveDocumentCompany } from "./companies";

type Business = { billingCompanies?: unknown };
type JobCompany = { companyId?: unknown; customerId?: string };

/** Reads a customer only when neither the document nor job has a known company. Always scoped to this tenant. */
export async function loadDocumentCompany(db: FirebaseFirestore.Firestore, businessId: string, business: Business, document: { companyId?: unknown } | null | undefined, job: JobCompany): Promise<BillingCompany | null> {
  return readDocumentCompany(db, businessId, business, document, job);
}

/** Transaction variant used by send claims: the chosen company cannot race the job/customer reads. */
export async function readDocumentCompany(db: FirebaseFirestore.Firestore, businessId: string, business: Business, document: { companyId?: unknown } | null | undefined, job: JobCompany, tx?: FirebaseFirestore.Transaction): Promise<BillingCompany | null> {
  if (!isMultiCompany(business)) return null;
  const known = companiesOf(business);
  const hasKnown = [document?.companyId, job.companyId].some(id => known.some(c => c.id === id));
  let customerCompanyId: unknown;
  if (!hasKnown && job.customerId) {
    const ref = db.collection(`businesses/${businessId}/customers`).doc(job.customerId);
    customerCompanyId = (await (tx ? tx.get(ref) : ref.get())).data()?.companyId;
  }
  return resolveDocumentCompany(business, { documentCompanyId: document?.companyId, jobCompanyId: job.companyId, customerCompanyId });
}
