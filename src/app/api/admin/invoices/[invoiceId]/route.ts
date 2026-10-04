import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { sendEmail } from "@/lib/comms/send";
import { buildLuxorReceiptEmail } from "@/lib/billing/luxorNotices";
import type { LuxorInvoice } from "@/app/admin/invoices/invoiceFlow";

export async function GET(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;

  const { invoiceId } = await params;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const snap = await db.collection("luxorInvoices").doc(invoiceId).get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ invoice: { invoiceId: snap.id, ...snap.data() } });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;

  const { invoiceId } = await params;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const body = await req.json().catch(() => null);

  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const ref = db.collection("luxorInvoices").doc(invoiceId);
  const before = (await ref.get()).data() as (LuxorInvoice & { receiptSentAt?: number }) | undefined;
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const now = Date.now();
  const becomingPaid = (body as { status?: string }).status === "paid" && before.status !== "paid";
  await ref.update({ ...body, ...(becomingPaid ? { paidAt: now } : {}), updatedAt: now });

  // Payment received → the client gets a receipt by email, once (owner, 2026-10-04). A send failure never undoes the
  // Mark paid; the response says whether it went so the page can show it.
  let receipt: "sent" | "not_sent" | "skipped" = "skipped";
  if (becomingPaid && !before.receiptSentAt && before.clientEmail) {
    const { subject, html } = buildLuxorReceiptEmail({ ...before, ...(body as Partial<LuxorInvoice>) }, now);
    const result = await sendEmail({ to: before.clientEmail, subject, html, fromName: "Luxor AI" });
    receipt = result.status === "delivered" ? "sent" : "not_sent";
    if (receipt === "sent") await ref.update({ receiptSentAt: now });
  }
  // A client paused for THIS invoice comes back on the moment it's paid (pauseClient on the Invoices page).
  let resumed = false;
  if (becomingPaid && before.businessId) {
    const bizRef = db.collection("businesses").doc(before.businessId);
    const biz = (await bizRef.get()).data();
    if (biz?.subscriptionStatus === "paused" && biz.pausedReason === `Unpaid invoice ${invoiceId}`) {
      await bizRef.update({ subscriptionStatus: "active", pausedAt: FieldValue.delete(), pausedReason: FieldValue.delete(), updatedAt: now });
      await db.collection("adminAuditEvents").doc(`audit_${now}`).set({
        auditEventId: `audit_${now}`, actorUid: gate.user.uid, actorEmail: gate.user.email, businessId: before.businessId,
        action: "subscription.resumed", targetPath: `businesses/${before.businessId}`,
        before: { subscriptionStatus: "paused" }, after: { subscriptionStatus: "active" }, createdAt: now,
      });
      resumed = true;
    }
  }
  return NextResponse.json({ ok: true, receipt, resumed });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;

  const { invoiceId } = await params;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  await db.collection("luxorInvoices").doc(invoiceId).delete();
  return NextResponse.json({ ok: true });
}
