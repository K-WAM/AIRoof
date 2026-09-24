import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import type { Lead } from "@/types";
import { sendEmail } from "@/lib/comms/send";
import { buildRequestDeclineEmail, REQUEST_DECLINE_REASONS, type RequestDeclineReason } from "@/lib/comms/requestDeclineEmail";

const VALID_STATUSES: Lead["status"][] = ["new", "contacted", "booked", "closed", "lost"];

// PATCH /api/businesses/[businessId]/leads/[leadId]  body: { businessId, status }
//
// Replaces the Pipeline page's direct client-Firestore `updateDoc` write —
// one of the last two call sites pulling @firebase/firestore into the
// browser bundle (see BootstrapContext migration). Narrowly scoped to the
// one field the UI actually changes here; the fuller lead lifecycle (notes,
// reassignment) still goes through admin-SDK routes elsewhere as before.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { leadId } = await params;
  const body = await req.json().catch(() => ({}));
  const { businessId, status, declineReason, customMessage } = body as {
    businessId?: string; status?: string; declineReason?: string; customMessage?: string;
  };

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  if (!status || !VALID_STATUSES.includes(status as Lead["status"])) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const ref = db.collection(`businesses/${businessId}/leads`).doc(leadId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  if (status === "lost") {
    if (!declineReason || !REQUEST_DECLINE_REASONS.includes(declineReason as RequestDeclineReason)) {
      return NextResponse.json({ error: "A valid declineReason is required" }, { status: 400 });
    }
    if (typeof customMessage !== "undefined" && (typeof customMessage !== "string" || customMessage.length > 300)) {
      return NextResponse.json({ error: "customMessage must be plain text up to 300 characters" }, { status: 400 });
    }
    const existing = snap.data() ?? {};
    if (existing.declinedAt) return NextResponse.json({ ok: true, alreadyDeclined: true, notifiedCustomer: false });
    const now = Date.now();
    await ref.update({ status: "lost", declinedAt: now, declineReason, decidedBy: gate.user.uid, updatedAt: now });
    const email = typeof existing.callerEmail === "string" ? existing.callerEmail : null;
    if (!email) return NextResponse.json({ ok: true, notifiedCustomer: false, noEmail: true });
    const business = (await db.collection("businesses").doc(businessId).get()).data() ?? {};
    const message = buildRequestDeclineEmail({
      brand: { businessName: typeof business.businessName === "string" ? business.businessName : "Your Company", brandColor: typeof business.brandColor === "string" ? business.brandColor : null, logoUrl: typeof business.logoUrl === "string" ? business.logoUrl : null, contactPhone: typeof business.contactPhone === "string" ? business.contactPhone : null, contactEmail: typeof business.contactEmail === "string" ? business.contactEmail : null },
      clientName: typeof existing.callerName === "string" ? existing.callerName : undefined,
      serviceType: typeof existing.serviceRequested === "string" ? existing.serviceRequested : undefined,
      reason: declineReason as RequestDeclineReason,
      customMessage: typeof customMessage === "string" ? customMessage : undefined,
    });
    const result = await sendEmail({ to: email, ...message });
    return NextResponse.json({ ok: true, notifiedCustomer: result.status === "delivered" });
  }

  await ref.update({ status, updatedAt: Date.now() });
  return NextResponse.json({ ok: true });
}
