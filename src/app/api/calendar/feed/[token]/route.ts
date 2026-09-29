import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { getAppUrl } from "@/lib/config/appUrl";
import { hashFeedToken, isFeedTokenShape } from "@/lib/calendar/feedToken";
import { buildInspectorFeed, type FeedBlock, type FeedBooking } from "@/lib/calendar/ics";
import { timeBlocksPath } from "@/types/schedule";

// GET /api/calendar/feed/<token> — one inspector's schedule as text/calendar, for a phone's "subscribe to calendar".
// No cookie (a phone calendar app can't sign in): the token IS the credential, so every failure is the same bare 404
// and the events carry only time / short name / address (see src/lib/calendar/ics.ts for why).

const DAY = 24 * 60 * 60 * 1000;
const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/i, "");
  if (!isFeedTokenShape(token)) return notFound();
  const db = getAdminFirestore();
  if (!db) return new NextResponse("Unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });

  const members = await db.collection("businessUsers").where("calendarFeedTokenHash", "==", hashFeedToken(token)).limit(1).get();
  const member = members.docs[0]?.data();
  const businessId = typeof member?.businessId === "string" ? member.businessId : null;
  const crewId = typeof member?.crewId === "string" ? member.crewId : null;
  if (!member || member.active === false || !["owner", "staff", "crew"].includes(member.role) || !businessId || !crewId) return notFound();

  const now = Date.now();
  const from = now - 7 * DAY;
  const to = now + 60 * DAY;
  const [business, crew, appointments, blocks] = await Promise.all([
    db.collection("businesses").doc(businessId).get(),
    db.collection(`businesses/${businessId}/crews`).doc(crewId).get(),
    db.collection(`businesses/${businessId}/appointments`).where("startTime", ">=", from).where("startTime", "<=", to).get(),
    db.collection(timeBlocksPath(businessId)).where("startTime", ">=", from - 14 * DAY).where("startTime", "<=", to).get(),
  ]);
  if (!crew.exists) return notFound();

  const bookings: FeedBooking[] = appointments.docs.flatMap((doc) => {
    const data = doc.data();
    if (data.assignedCrewId !== crewId || data.status === "cancelled" || typeof data.startTime !== "number") return [];
    return [{
      appointmentId: doc.id,
      startTime: data.startTime,
      ...(typeof data.endTime === "number" ? { endTime: data.endTime } : {}),
      ...(typeof data.callerName === "string" ? { callerName: data.callerName } : {}),
      ...(typeof data.serviceType === "string" ? { serviceType: data.serviceType } : {}),
      ...(typeof data.address === "string" ? { address: data.address } : {}),
      pendingConfirmation: data.pendingConfirmation === true,
    }];
  });
  const feedBlocks: FeedBlock[] = blocks.docs.flatMap((doc) => {
    const data = doc.data();
    if (data.crewId !== crewId || typeof data.startTime !== "number" || typeof data.endTime !== "number" || data.endTime < from) return [];
    return [{ blockId: doc.id, startTime: data.startTime, endTime: data.endTime, label: typeof data.label === "string" ? data.label : "Blocked" }];
  });

  const businessName = typeof business.data()?.businessName === "string" ? business.data()!.businessName as string : "Schedule";
  const body = buildInspectorFeed({
    calendarName: `${businessName} — ${typeof crew.data()?.name === "string" ? crew.data()!.name : "My schedule"}`,
    bookings,
    blocks: feedBlocks,
    fieldUrl: `${getAppUrl()}/company/field`,
    now,
  });
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="schedule.ics"',
      // A bearer link: never let a shared cache hold one person's schedule (CLAUDE.md "Cache-Control Rule").
      "Cache-Control": "private, no-store",
    },
  });
}
