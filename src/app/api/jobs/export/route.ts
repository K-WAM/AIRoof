import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import type { Job } from "@/types/jobs";
import type { JobInvoice } from "@/types/invoice";

function csvCell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const snap = await db.collection(`businesses/${businessId}/jobs`).orderBy("createdAt", "desc").get();
  const jobs = snap.docs.map((doc) => ({ jobId: doc.id, ...doc.data() }) as Job);
  const invoices = new Map<string, JobInvoice>();
  const ids = [...new Set(jobs.map((job) => job.invoiceId).filter((id): id is string => !!id))];
  for (let index = 0; index < ids.length; index += 50) {
    const batch = await Promise.all(ids.slice(index, index + 50).map(async (id) => {
      const doc = await db.collection(`businesses/${businessId}/invoices`).doc(id).get();
      return [id, doc.exists ? doc.data() as JobInvoice : null] as const;
    }));
    for (const [id, invoice] of batch) if (invoice) invoices.set(id, invoice);
  }

  const columns = ["id", "title", "customer", "phone", "address", "status", "created", "completed", "invoice id", "invoice status", "total"];
  const rows = jobs.map((job) => {
    const invoice = job.invoiceId ? invoices.get(job.invoiceId) : undefined;
    return [job.jobId, job.title, job.clientName, job.clientPhone, job.address, job.status,
      job.createdAt ? new Date(job.createdAt).toISOString() : "",
      job.completedAt ? new Date(job.completedAt).toISOString() : "",
      job.invoiceId, invoice?.status, invoice?.total];
  });
  const csv = [columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="jobs.csv"',
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
