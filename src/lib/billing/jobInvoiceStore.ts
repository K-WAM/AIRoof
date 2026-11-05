import type { JobInvoice } from "@/types/invoice";
import { withInvoiceDeposits } from "./jobInvoiceDeposits";
import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import type { Job } from "@/types/jobs";

export class InvoiceConflict extends Error {}
export function jobInvoices(db: FirebaseFirestore.Firestore, businessId: string, jobId: string) {
  return db.collection(`businesses/${businessId}/invoices`).where("jobId", "==", jobId);
}
/** All draft writes recompute credits from tenant-owned sent/paid deposits, never browser-supplied credits. */
export async function updateStandardDraft(db: FirebaseFirestore.Firestore, businessId: string, invoiceId: string, patch?: Partial<JobInvoice>): Promise<JobInvoice | null> {
  const ref = db.collection(`businesses/${businessId}/invoices`).doc(invoiceId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const current = { ...snap.data(), invoiceId: snap.id } as JobInvoice;
    if (current.kind === "deposit") return null;
    if (patch && current.jobId) {
      const job = await tx.get(db.collection(`businesses/${businessId}/jobs`).doc(current.jobId));
      if (job.data()?.documentSendLock) throw new InvoiceConflict("An invoice is being sent. Reload after it finishes.");
    }
    if (current.status !== "draft") {
      if (patch) throw new InvoiceConflict("The invoice is no longer a draft. Reload before editing.");
      return current;
    }
    const deposits = await tx.get(jobInvoices(db, businessId, current.jobId));
    const merged = { ...current, ...patch };
    const next = withInvoiceDeposits(merged, deposits.docs.map(d => ({ ...d.data(), invoiceId: d.id }) as JobInvoice));
    if (JSON.stringify(next) !== JSON.stringify(current)) tx.update(ref, { ...next, updatedAt: Date.now() });
    return next;
  });
}

/** Serialize deposit/final sends on the job. No timeout auto-release: a slow provider must never race a second send. */
export async function claimInvoiceSend(db: FirebaseFirestore.Firestore, businessId: string, jobId: string, requestedId?: string) {
  const jobRef = db.collection(`businesses/${businessId}/jobs`).doc(jobId), token = randomUUID();
  return db.runTransaction(async tx => {
    const jobSnap = await tx.get(jobRef);
    if (!jobSnap.exists) throw new InvoiceConflict("Job not found");
    const job = jobSnap.data() as Job;
    if (job.documentSendLock) throw new InvoiceConflict("An invoice is already being sent for this job.");
    const invoiceId = requestedId ?? job.invoiceId;
    if (!invoiceId) throw new InvoiceConflict("No invoice exists for this job yet");
    const ref = db.collection(`businesses/${businessId}/invoices`).doc(invoiceId), snap = await tx.get(ref);
    if (!snap.exists) throw new InvoiceConflict("Invoice not found");
    const current = { ...snap.data(), invoiceId } as JobInvoice;
    if (current.jobId !== jobId || (requestedId ? current.kind !== "deposit" : current.kind === "deposit")) throw new InvoiceConflict("Invoice does not match this document");
    if (current.status === "void") throw new InvoiceConflict("A void invoice cannot be sent");
    const invoices = await tx.get(jobInvoices(db, businessId, jobId));
    const all = invoices.docs.map(d => ({ ...d.data(), invoiceId: d.id }) as JobInvoice);
    if (current.kind === "deposit" && current.status === "draft" && all.some(d => d.kind !== "deposit" && d.status !== "draft" && d.status !== "void")) throw new InvoiceConflict("The final invoice has already been sent");
    const invoice = withInvoiceDeposits(current, all);
    if (invoice !== current) tx.update(ref, { ...invoice, updatedAt: Date.now() });
    tx.update(jobRef, { documentSendLock: { invoiceId, token, at: Date.now() } });
    return { invoice, job, token };
  });
}

export async function finishInvoiceSend(db: FirebaseFirestore.Firestore, businessId: string, jobId: string, invoiceId: string, token: string, to: string, uid: string, delivered: boolean) {
  const jobRef = db.collection(`businesses/${businessId}/jobs`).doc(jobId), ref = db.collection(`businesses/${businessId}/invoices`).doc(invoiceId);
  await db.runTransaction(async tx => {
    const jobSnap = await tx.get(jobRef), snap = await tx.get(ref);
    const job = jobSnap.data() as Job, invoice = snap.data() as JobInvoice;
    if (job.documentSendLock?.token !== token) throw new InvoiceConflict("Invoice send ownership changed");
    if (delivered) {
      const now = Date.now();
      tx.update(ref, { ...(invoice.status === "paid" ? {} : { status: "sent" }), sentAt: now, sentTo: to, updatedAt: now });
      if (invoice.kind !== "deposit" && invoice.status !== "paid" && job.status !== "invoiced") tx.update(jobRef, { status: "invoiced", updatedAt: now, statusHistory: [...(job.statusHistory ?? []), { status: "invoiced", at: now, by: uid }] });
    }
    tx.update(jobRef, { documentSendLock: FieldValue.delete() });
  });
}
