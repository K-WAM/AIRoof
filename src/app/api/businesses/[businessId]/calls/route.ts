import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";

// GET /api/businesses/[businessId]/calls?limit=N — full call list, newest
// first (transcript/messages included, same shape the Calls page already
// rendered from a direct client Firestore read).
// GET .../calls?countOnly=1 — just the total count via a Firestore
// aggregation query (no document bodies transferred) for a caller that only
// needs the number, e.g. the Dashboard's "Total calls" tile.
//
// T-071 (round-trip time): server-side admin-SDK read replacing the client
// Firestore query this page used to run directly — see the leads route for
// the full rationale.
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

  const collection = db.collection(`businesses/${businessId}/calls`);

  if (req.nextUrl.searchParams.get("countOnly")) {
    const countSnap = await collection.count().get();
    return NextResponse.json({ count: countSnap.data().count });
  }

  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 500;

  const snap = await collection.orderBy("startedAt", "desc").limit(limit).get();
  const calls = snap.docs.map((d) => ({ callId: d.id, ...d.data() }));
  return NextResponse.json({ calls });
}
