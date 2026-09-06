import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import type { Lead } from "@/types";

// GET /api/businesses/[businessId]/leads?limit=N — leads, newest first.
//
// T-071 (round-trip time): a server-side admin-SDK read replaces what used to
// be a direct client Firestore query on the Dashboard/Pipeline pages (client
// SDK reads pay connection setup + security-rule evaluation on top of the
// actual query, on whatever network the browser is on; a server read is one
// HTTP round trip to us, then a fast datacenter-to-datacenter Firestore read).
//
// This also happens to fix a pre-existing dead endpoint: CommandBar has
// called this exact path since it was built, but the route never existed —
// every command-palette lead search has silently 404'd (swallowed by a
// `.catch(() => null)`) until now.
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

  const snap = await db
    .collection(`businesses/${businessId}/leads`)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  const leads = snap.docs.map((d) => ({ leadId: d.id, ...d.data() })) as Lead[];
  return NextResponse.json({ leads });
}
