import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import type { Appointment } from "@/types";

const VALID_STATUSES: Appointment["status"][] = ["requested", "confirmed", "cancelled", "completed"];

// PATCH /api/businesses/[businessId]/appointments/[appointmentId]  body: { businessId, status }
//
// A plain status flip (Confirm / Cancel from the Pipeline list) — replaces
// the last direct client-Firestore write in the app (see BootstrapContext
// migration). Deliberately separate from the transactional
// /api/appointments/[appointmentId] route, which reassigns crews/times under
// scheduling locks; mixing a bare status write into that transaction's
// conflict-detection logic would be a needless risk for what the Pipeline
// list actually needs here.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  const { appointmentId } = await params;
  const body = await req.json().catch(() => ({}));
  const { businessId, status } = body as { businessId?: string; status?: string };

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  if (!status || !VALID_STATUSES.includes(status as Appointment["status"])) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const ref = db.collection(`businesses/${businessId}/appointments`).doc(appointmentId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });

  await ref.update({ status, updatedAt: Date.now() });
  return NextResponse.json({ ok: true });
}
