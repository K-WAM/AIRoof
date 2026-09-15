import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { isCommsConfigured, sendEmail } from "@/lib/comms/send";
import { buildJobInvoiceEmailHtml } from "@/lib/billing/jobInvoiceEmailHtml";
import type { JobInvoice } from "@/types/invoice";

// POST /api/jobs/[jobId]/invoice/send  body: { businessId, to }
// Phase 12/Phase 4 rewrite: reads the SAVED invoice doc instead of trusting rows the client
// sends — a client can no longer email totals that were never actually persisted/reviewed.
// The HTML itself is built by jobInvoiceEmailHtml.ts (a pure, unit-tested module) so this route
// stays a thin auth-and-fetch shell.
export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  if (!isCommsConfigured()) return NextResponse.json({ error: "Email not configured" }, { status: 503 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Firestore not available" }, { status: 503 });

  let body: { businessId?: string; to?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { businessId, to } = body;
  if (!businessId || !to) return NextResponse.json({ error: "businessId and to required" }, { status: 400 });

  const gate = await verifyAuthAndRole(request, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const jobSnap = await db.collection(`businesses/${businessId}/jobs`).doc(jobId).get();
  const invoiceId = jobSnap.data()?.invoiceId;
  if (!invoiceId) return NextResponse.json({ error: "No invoice exists for this job yet" }, { status: 404 });

  const invRef = db.collection(`businesses/${businessId}/invoices`).doc(invoiceId);
  const invSnap = await invRef.get();
  if (!invSnap.exists) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const invoice = invSnap.data() as JobInvoice;

  const bizDoc = await db.collection("businesses").doc(businessId).get();
  const biz = bizDoc.exists ? bizDoc.data()! : {};
  const bizName: string = biz.businessName ?? "Roofing Company";

  const html = buildJobInvoiceEmailHtml(invoice, {
    businessName: bizName,
    brandColor: biz.brandColor,
    logoUrl: biz.logoUrl,
    address: biz.address,
    // Bug fix: this previously read `biz.phone`, a field that has never existed on
    // BusinessConfig (the branding field is `contactPhone`) — the business phone silently never
    // appeared on a sent invoice regardless of what was configured in Settings.
    contactPhone: biz.contactPhone,
    contactEmail: biz.contactEmail,
    websiteUrl: biz.websiteUrl,
  });

  await sendEmail({
    to,
    subject: `[Invoice] ${invoice.invoiceId} from ${bizName}`,
    html,
  });

  await invRef.update({ status: "sent", sentAt: Date.now(), sentTo: to, updatedAt: Date.now() });

  return NextResponse.json({ ok: true });
}
