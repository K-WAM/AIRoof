import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { dayWindow, parseBusinessHours, zonedDateTimeToUtc, zonedParts } from "@/lib/scheduling/hours";
import { openStartTimes, type BusyRange } from "@/lib/calendar/openTimes";

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const NEXT_OPEN_SCAN_DAYS = 14;
const DEFAULT_TZ = "America/New_York";

function localKey(timestamp: number, timeZone: string): string {
  const parts = zonedParts(timestamp, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

// GET /api/company/crews/open-times?businessId&crewId&day=YYYY-MM-DD[&durationMin=60][&jobId=J-1001]
// The Calendar's drop popup (T-149): which start times this crew has free that day, in the business's own hours and
// time zone, for a job of `durationMin`. `jobId` leaves that job's own current slot out, so moving a tile can keep its
// time. When the day has nothing, `nextOpen` is the crew's first opening in the next two weeks. Advisory only — the
// assign route re-checks every overlap when the time is saved.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const businessId = params.get("businessId");
  const crewId = params.get("crewId");
  const day = params.get("day") ?? "";
  const jobId = params.get("jobId");
  const durationMin = Number(params.get("durationMin") ?? 60);
  const dayMatch = DAY_PATTERN.exec(day);
  if (!businessId || !crewId || !dayMatch) {
    return NextResponse.json({ error: "businessId, crewId and day (YYYY-MM-DD) required" }, { status: 400 });
  }
  if (!Number.isInteger(durationMin) || durationMin < 15 || durationMin > 12 * 60) {
    return NextResponse.json({ error: "durationMin must be 15–720 minutes" }, { status: 400 });
  }

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const businessRef = db.collection("businesses").doc(businessId);
  const [businessSnap, crewSnap, jobsSnap, apptsSnap, blocksSnap] = await Promise.all([
    businessRef.get(),
    businessRef.collection("crews").doc(crewId).get(),
    businessRef.collection("jobs").where("assignedCrewId", "==", crewId).get(),
    businessRef.collection("appointments").where("assignedCrewId", "==", crewId).get(),
    // Phase 31 (T-152): an inspector's own time blocks are busy too, so the drop popup never offers a blocked start.
    businessRef.collection("timeBlocks").where("crewId", "==", crewId).get(),
  ]);
  if (!businessSnap.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  if (!crewSnap.exists) return NextResponse.json({ error: "Crew not found" }, { status: 404 });

  const business = businessSnap.data() ?? {};
  const timeZone = typeof business.timezone === "string" && business.timezone ? business.timezone : DEFAULT_TZ;
  if (!parseBusinessHours(business.businessHours)) {
    return jsonWithCache({ day, starts: [], reason: "no_hours", nextOpen: null }, "noStore");
  }

  const busy: BusyRange[] = [];
  for (const doc of jobsSnap.docs) {
    if (doc.id === jobId) continue;
    const data = doc.data();
    if (typeof data.scheduledStart === "number" && typeof data.scheduledEnd === "number") {
      busy.push({ start: data.scheduledStart, end: data.scheduledEnd });
    }
  }
  for (const doc of apptsSnap.docs) {
    const data = doc.data();
    if (data.status !== "cancelled" && typeof data.startTime === "number" && typeof data.endTime === "number") {
      busy.push({ start: data.startTime, end: data.endTime });
    }
  }
  for (const doc of blocksSnap.docs) {
    const data = doc.data();
    if (typeof data.startTime === "number" && typeof data.endTime === "number") {
      busy.push({ start: data.startTime, end: data.endTime });
    }
  }

  const now = Date.now();
  const durationMs = durationMin * 60 * 1000;
  // Local noon is always inside the named date, even across a daylight-saving change.
  const noon = zonedDateTimeToUtc({ year: Number(dayMatch[1]), month: Number(dayMatch[2]), day: Number(dayMatch[3]), hour: 12, minute: 0 }, timeZone);
  if (noon === null) return NextResponse.json({ error: "That day does not exist" }, { status: 400 });
  const startsOn = (timestamp: number) => {
    const window = dayWindow(timestamp, timeZone, business.businessHours);
    return { window, starts: window ? openStartTimes({ window, busy, durationMs, notBefore: now }) : [] };
  };

  const { window, starts } = startsOn(noon);
  let nextOpen: { day: string; start: number } | null = null;
  if (starts.length === 0) {
    for (let offset = 1; offset <= NEXT_OPEN_SCAN_DAYS && !nextOpen; offset++) {
      const later = startsOn(noon + offset * DAY_MS);
      if (later.starts.length > 0) nextOpen = { day: localKey(later.starts[0], timeZone), start: later.starts[0] };
    }
  }
  const reason = starts.length > 0
    ? null
    : !window ? "closed" : window.endTime <= now ? "past" : "full";

  const aroundTheClock = !!window && zonedParts(window.startTime, timeZone).hour === 0 && window.endTime - window.startTime >= 23 * 60 * 60 * 1000;
  return jsonWithCache({ day, timeZone, window, starts, aroundTheClock, reason, nextOpen, crewActive: crewSnap.data()?.active !== false }, "noStore");
}
