import { NextRequest } from "next/server";
import { verifyOwnBusinessRole } from "@/lib/auth/verifyRole";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { companiesOf, isMultiCompany } from "@/lib/companies/companies";
import { sendLockActive } from "@/lib/billing/jobInvoiceStore";
import { jsonWithCache } from "@/lib/http/cache";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const gate = await verifyOwnBusinessRole(req, ["owner", "staff"]);
  if ("error" in gate) return gate.error;
  const body = await req.json().catch(() => null);
  if (!body || !["quote", "invoice", "deposit", "report"].includes(body.kind) || typeof body.companyId !== "string") return jsonWithCache({ error: "Choose a document and company." }, "noStore", { status: 400 });
  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Database unavailable" }, "noStore", { status: 503 });
  const { jobId } = await params, businessId = gate.user.businessId!;
  const jobRef = db.collection(`businesses/${businessId}/jobs`).doc(jobId);
  const result = await db.runTransaction(async tx => {
    const [bizSnap, jobSnap] = await Promise.all([tx.get(db.collection("businesses").doc(businessId)), tx.get(jobRef)]);
    if (!jobSnap.exists) return { error: "Job not found", status: 404 };
    const biz = bizSnap.data(), job = jobSnap.data()!;
    if (!isMultiCompany(biz)) return { ok: true }; // No new stored field for single-company businesses.
    if (!companiesOf(biz).some(c => c.id === body.companyId)) return { error: "Company not found", status: 400 };
    if (body.kind === "report") {
      if (job.reportDocument?.sentAt || sendLockActive(job.reportCompanySendClaim)) return { error: "A sent report keeps its company.", status: 409 };
      tx.update(jobRef, { reportDocument: { ...job.reportDocument, companyId: body.companyId }, updatedAt: Date.now() });
    } else {
      const id = body.kind === "quote" ? job.quoteId : body.kind === "invoice" ? job.invoiceId : body.invoiceId;
      if (typeof id !== "string" || !/^[\w-]{1,128}$/.test(id)) return { error: "Document not found", status: 404 };
      const ref = db.collection(`businesses/${businessId}/${body.kind === "quote" ? "quotes" : "invoices"}`).doc(id);
      const doc = (await tx.get(ref)).data();
      if (!doc || doc.jobId !== jobId || doc.businessId !== businessId || (body.kind === "deposit" ? doc.kind !== "deposit" : body.kind === "invoice" && doc.kind === "deposit")) return { error: "Document not found", status: 404 };
      if (doc.status !== "draft" || sendLockActive(doc.companySendClaim) || sendLockActive(job.documentSendLock)) return { error: "Only a draft document's company can be changed.", status: 409 };
      tx.update(ref, { companyId: body.companyId, updatedAt: Date.now() });
    }
    tx.set(jobRef.collection("auditEvents").doc(), { action: "document.company.changed", actorUid: gate.user.uid, businessId, jobId, kind: body.kind, companyId: body.companyId, createdAt: Date.now() });
    return { ok: true, companyId: body.companyId };
  });
  return jsonWithCache("error" in result ? { error: result.error } : result, "noStore", { status: "error" in result ? result.status : 200 });
}
