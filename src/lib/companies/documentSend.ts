import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { isMultiCompany } from "./companies";
import { readDocumentCompany } from "./documentCompany";
import { sendLockActive } from "@/lib/billing/jobInvoiceStore";

export type CompanySendClaim = { token: string; companyId: string; at: number };

/** Multi-company quote/report sends claim the company before building mail; failed delivery never pins a draft. */
export async function claimDocumentCompany(db: FirebaseFirestore.Firestore, businessId: string, jobId: string, kind: "quote" | "report") {
  const jobRef = db.collection(`businesses/${businessId}/jobs`).doc(jobId);
  return db.runTransaction(async tx => {
    const [bizSnap, jobSnap] = await Promise.all([tx.get(db.collection("businesses").doc(businessId)), tx.get(jobRef)]);
    const business = bizSnap.data() ?? {}, job = jobSnap.data();
    if (!job) throw new Error("Job not found");
    if (!isMultiCompany(business)) return null;
    const ref = kind === "quote" ? db.collection(`businesses/${businessId}/quotes`).doc(job.quoteId) : jobRef;
    const record = kind === "quote" ? (await tx.get(ref)).data() : job;
    if (!record || (kind === "quote" && record.status !== "draft")) throw new Error("Only a draft quote can be sent");
    const key = kind === "quote" ? "companySendClaim" : "reportCompanySendClaim";
    if (sendLockActive(record[key])) throw new Error("This document is already being sent.");
    const document = kind === "quote" ? record : job.reportDocument;
    const company = await readDocumentCompany(db, businessId, business, document, job, tx);
    const claim: CompanySendClaim = { token: randomUUID(), companyId: company!.id, at: Date.now() };
    tx.update(ref, { [key]: claim });
    return { ...claim, ref, key };
  });
}

export async function finishDocumentCompany(db: FirebaseFirestore.Firestore, claim: Awaited<ReturnType<typeof claimDocumentCompany>>, delivered: boolean, patch: Record<string, unknown> = {}) {
  if (!claim) return;
  await db.runTransaction(async tx => {
    const record = (await tx.get(claim.ref)).data();
    if (record?.[claim.key]?.token !== claim.token) throw new Error("Document send ownership changed");
    tx.update(claim.ref, { [claim.key]: FieldValue.delete(), ...(delivered ? claim.key === "companySendClaim"
      ? { ...patch, companyId: claim.companyId }
      : { reportDocument: { ...record.reportDocument, companyId: claim.companyId, sentAt: Date.now() }, ...patch } : {}) });
  });
}
