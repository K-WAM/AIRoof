import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import type { Appointment } from "@/types";

// GET /api/businesses/[businessId]/appointments?limit=N&order=asc|desc
//
// T-071 (round-trip time): server-side admin-SDK read replacing a direct
// client Firestore query — see the leads route (same collection/pattern) for
// the full rationale. `order` defaults to "asc" (soonest first, matching the
// Dashboard/Pipeline's upcoming-appointments views); pass `order=desc` for a
// most-recent-first list (what CommandBar's search wants).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await params;
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "viewer", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 500;
  const order = req.nextUrl.searchParams.get("order") === "desc" ? "desc" : "asc";

  const snap = await db
    .collection(`businesses/${businessId}/appointments`)
    .orderBy("startTime", order)
    .limit(limit)
    .get();

  const appointments = snap.docs.map((d) => ({ appointmentId: d.id, ...d.data() })) as Appointment[];
  return NextResponse.json({ appointments });
}
