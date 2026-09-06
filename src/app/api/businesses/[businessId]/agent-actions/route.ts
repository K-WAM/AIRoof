import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";

// GET /api/businesses/[businessId]/agent-actions?limit=N — most recent agent
// actions (bookings, leads, escalations, …). No server-side type filter —
// deliberately mirrors the old client query exactly (fetch the most recent
// N, let the caller pick out what it cares about, e.g. the Dashboard's
// escalation-alert banner filters for type === "escalateCall") rather than
// adding a `where` clause that would need its own composite Firestore index.
//
// T-071 (round-trip time): server-side admin-SDK read replacing the client
// Firestore query the Dashboard used to run directly — see the leads route
// for the full rationale.
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
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;

  const snap = await db
    .collection(`businesses/${businessId}/agentActions`)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  const actions = snap.docs.map((d) => ({ actionId: d.id, ...d.data() }));
  return NextResponse.json({ actions });
}
