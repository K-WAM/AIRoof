import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";

// PATCH /api/appointments/[appointmentId] — assign a provider/vendor and/or move
// the booking to another day. This is what the Calendar board writes for
// industries with calendarMode "appointments" (dental, property management).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  const { appointmentId } = await params;

  let body: {
    businessId?: string;
    assignedCrewId?: string | null;
    startTime?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { businessId, assignedCrewId, startTime } = body;
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  if (startTime !== undefined && startTime !== null && !Number.isFinite(startTime)) {
    return NextResponse.json({ error: "startTime must be a timestamp" }, { status: 400 });
  }

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const ref = db.collection(`businesses/${businessId}/appointments`).doc(appointmentId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });

  const update: Record<string, unknown> = { updatedAt: Date.now() };
  if (assignedCrewId !== undefined) update.assignedCrewId = assignedCrewId;
  if (startTime !== undefined && startTime !== null) {
    // Keep the appointment's duration when it moves to a new day/slot.
    const prev = snap.data()!;
    const duration = Math.max(0, (prev.endTime as number) - (prev.startTime as number)) || 60 * 60 * 1000;
    update.startTime = startTime;
    update.endTime = startTime + duration;
  }

  await ref.update(update);
  return NextResponse.json({ ok: true });
}
