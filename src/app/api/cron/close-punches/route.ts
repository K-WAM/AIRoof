// Nightly: auto-close any worker still on the clock from a day that's already over, so the
// cross-job guard doesn't block them the next morning (docs/PLATFORM-EXPANSION-PLAN.md Phase 5).
// Writes an `auto-close` punch at 23:59:59 local for each business's own still-open workers as
// of yesterday, business-tz. This is a defense-in-depth backstop, not the primary UX — a worker
// who actually remembers to punch out never touches this path. Auto-pause-on-inactivity is
// deliberately NOT implemented instead (see fold.ts's own module comment): geofencing/activity
// heuristics on the free plan produce wrong payroll, which is worse than an occasional
// missing_out flag a human corrects with one tap.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireCronAuth } from "@/lib/auth/cronGuard";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { foldPunches } from "@/lib/timeclock/fold";
import { dayKey } from "@/lib/format";
import type { Punch, PunchType } from "@/types/timeclock";

// Bounds how far back a single run looks per business — plenty for a cron that's meant to run
// every night; if it's ever missed for several days running, a later run still closes whatever
// it can see within this window rather than scanning a business's entire history.
const RECENT_PUNCH_LIMIT = 3000;

export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const now = Date.now();
  const businessesSnap = await db.collection("businesses").get();

  let closed = 0;
  let businessesTouched = 0;

  for (const bizDoc of businessesSnap.docs) {
    const businessId = bizDoc.id;
    const bizData = bizDoc.data();
    const tz = typeof bizData?.timezone === "string" && bizData.timezone.length > 0
      ? bizData.timezone
      : "America/New_York";
    const todayKey = dayKey(now, tz);

    const punchesCol = db.collection(`businesses/${businessId}/punches`);
    const snap = await punchesCol.orderBy("at", "desc").limit(RECENT_PUNCH_LIMIT).get();
    if (snap.empty) continue;
    const punches = snap.docs.map((d) => ({ punchId: d.id, ...d.data() })) as Punch[];

    const days = foldPunches(punches, now, tz).filter((d) => d.dayKey !== todayKey);
    const stillOpen = days.filter((d) => d.state !== "off");
    if (stillOpen.length === 0) continue;

    const batch = db.batch();
    for (const day of stillOpen) {
      // Close at 23:59:59 local of the day it was actually open, not "now" — never invent
      // hours the worker didn't punch for.
      const [y, m, d] = day.dayKey.split("-").map(Number);
      const closeAtLocalMidnight = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
      // Approximate: treat the wall-clock 23:59:59 as if it were UTC, then correct by the
      // offset the business's own tz has at that moment. Good enough for a nightly backstop
      // (off by at most the tz's UTC offset, always resolving to *a* timestamp on the correct
      // calendar day) without pulling in a timezone-math dependency this app doesn't have.
      const offsetProbe = new Date(closeAtLocalMidnight.toLocaleString("en-US", { timeZone: tz }));
      const offsetMs = closeAtLocalMidnight.getTime() - offsetProbe.getTime();
      const at = closeAtLocalMidnight.getTime() + offsetMs;

      const closeType: PunchType = (day.state === "site" || day.state === "site_break") ? "site_out" : "office_out";
      const punch: Punch = {
        punchId: `pn_${at}_${randomUUID().slice(0, 8)}`,
        businessId,
        workerKey: day.workerKey,
        workerName: day.workerName,
        type: closeType,
        ...(closeType === "site_out" && day.openJobId ? { jobId: day.openJobId } : {}),
        at,
        dayKey: day.dayKey,
        source: "auto-close",
        createdAt: now,
      };
      batch.set(punchesCol.doc(punch.punchId), punch);
      closed += 1;
    }
    await batch.commit();
    businessesTouched += 1;
  }

  return NextResponse.json({ ok: true, businessesTouched, punchesClosed: closed });
}
