import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { guessCallCategory } from "@/lib/calls/category";

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

  // Call docs carry a full transcript + messages[] (the largest payload in
  // the app per doc) — the Calls page is the only consumer of this list mode
  // and doesn't pass ?limit=, so the *default* is what actually matters here.
  // 500 was needlessly large for a list view; an explicit ?limit= can still
  // go up to 500 for a caller that genuinely wants it.
  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 100;

  const snap = await collection.orderBy("startedAt", "desc").limit(limit).get();
  // ?slim=1 — the Calls list: no transcript (a doc's bulk; the page fetches one call's transcript when it is opened via
  // GET /api/calls/[callId]), just the topic badge the list draws from it.
  if (req.nextUrl.searchParams.get("slim")) {
    const calls = snap.docs.map((d) => {
      const { messages, transcript, ...rest } = d.data() as Record<string, unknown>;
      const spoken = (Array.isArray(messages) ? messages : Array.isArray(transcript) ? transcript : []) as Array<{ role?: string; text?: string }>;
      const turns = spoken.filter((m) => (m.role === "caller" || m.role === "agent") && Boolean(m.text?.trim())).length;
      return { callId: d.id, ...rest, category: guessCallCategory(spoken), turns, hasTranscript: turns > 0 };
    });
    return NextResponse.json({ calls });
  }
  const calls = snap.docs.map((d) => ({ callId: d.id, ...d.data() }));
  return NextResponse.json({ calls });
}
