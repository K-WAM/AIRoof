import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { getAppUrl } from "@/lib/config/appUrl";
import { hashFeedToken, newFeedToken } from "@/lib/calendar/feedToken";

// POST   /api/company/team/me/calendar-feed { businessId } — create or REPLACE the signed-in member's phone-calendar
//        link (the old link stops working at once). The URL is returned this once; only its hash is stored.
// DELETE /api/company/team/me/calendar-feed?businessId=… — turn the link off.
// Only for a real team member with a schedule row: the superadmin has no businessUsers doc to hang a link on.

const MEMBER_ROLES = ["owner", "staff", "crew"] as const;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { businessId?: string };
  if (!body.businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const gate = await verifyAuthAndRole(req, body.businessId, [...MEMBER_ROLES]);
  if ("error" in gate) return gate.error;
  if (!gate.user.crewId) {
    return NextResponse.json({ error: "Ask the office to put you on a schedule row first (Library → Crews)." }, { status: 409 });
  }
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const token = newFeedToken();
  await db.collection("businessUsers").doc(gate.user.uid).update({ calendarFeedTokenHash: hashFeedToken(token), calendarFeedCreatedAt: Date.now() });
  const https = `${getAppUrl()}/api/calendar/feed/${token}.ics`;
  return NextResponse.json({ url: https, webcal: https.replace(/^https?:\/\//, "webcal://") }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const gate = await verifyAuthAndRole(req, businessId, [...MEMBER_ROLES]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  await db.collection("businessUsers").doc(gate.user.uid).update({ calendarFeedTokenHash: FieldValue.delete(), calendarFeedCreatedAt: FieldValue.delete() });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
