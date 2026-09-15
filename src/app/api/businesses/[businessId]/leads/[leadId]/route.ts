import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import type { Lead } from "@/types";

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
  const { businessId, status } = body as { businessId?: string; status?: string };

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

  await ref.update({ status, updatedAt: Date.now() });
  return NextResponse.json({ ok: true });
}
