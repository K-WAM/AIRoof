// Daily booking canary (G4 / docs/BOOKING-RELIABILITY-PLAN.md). Booking failed silently for a day once; this asks the
// real availability engine for the next business day, for the demo tenant and every tenant that can take a call, and
// alerts the owner + flags Admin Usage when the answer is unusable — an overnight/past/outside-hours slot, no opening
// on a day that has hours, or hours that will not parse. Read-only: it writes only the `bookingCheck` summary onto the
// business document (the same doc Admin Usage renders); it never creates or changes an appointment.

import { NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/auth/cronGuard";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { jsonWithCache } from "@/lib/http/cache";
import { sendEmail } from "@/lib/comms/send";
import { checkAvailability } from "@/lib/tools/agentTools";
import {
  parseBusinessHours,
  zonedDateTimeToUtc,
  zonedParts,
  type ParsedBusinessHours,
  type Weekday,
} from "@/lib/scheduling/hours";

// The one address every other platform alert uses (welcome, feedback, webhook health) — never invent a new one.
const PLATFORM_ALERT_TO = "connect@luxordev.com";

const DEFAULT_TZ = "America/New_York";
const DURATION_MINUTES = 60;
const SCAN_DAYS = 10;
// The booking engine must never offer a time between 9 PM and 7 AM unless the caller named one.
const OVERNIGHT_START = 21 * 60;
const OVERNIGHT_END = 7 * 60;

interface BookingCheckIssue {
  businessId: string;
  businessName: string;
  problems: string[];
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function localDateKey(timestamp: number, timeZone: string): string {
  const parts = zonedParts(timestamp, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function describeSlot(timestamp: number, timeZone: string): string {
  return new Date(timestamp).toLocaleString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The first local day after today that has hours, scanning `scanDays` days ahead. */
function findNextBusinessDay(
  now: number,
  timeZone: string,
  hours: ParsedBusinessHours,
  scanDays = SCAN_DAYS,
): { date: string; weekday: Weekday } | null {
  const today = zonedParts(now, timeZone);
  const baseNoon = zonedDateTimeToUtc({ year: today.year, month: today.month, day: today.day, hour: 12, minute: 0 }, timeZone);
  if (baseNoon === null) return null;
  for (let offset = 1; offset <= scanDays; offset++) {
    const timestamp = baseNoon + offset * 86_400_000;
    const parts = zonedParts(timestamp, timeZone);
    if (hours[parts.weekday]) return { date: localDateKey(timestamp, timeZone), weekday: parts.weekday };
  }
  return null;
}

/** Every reason an availability answer is not something a caller could book. */
function bookingProblems(options: {
  now: number;
  timeZone: string;
  hours: ParsedBusinessHours;
  nextDay: { date: string; weekday: Weekday };
  slots: Array<{ startTime: string }>;
}): string[] {
  const problems: string[] = [];
  let onNextDay = 0;
  for (const slot of options.slots) {
    const start = Date.parse(slot.startTime);
    if (!Number.isFinite(start)) {
      problems.push(`checkAvailability returned an unreadable slot: ${slot.startTime}`);
      continue;
    }
    const parts = zonedParts(start, options.timeZone);
    const startMinutes = parts.hour * 60 + parts.minute;
    const dayHours = options.hours[parts.weekday];
    const endMinutes = startMinutes + DURATION_MINUTES;
    const when = describeSlot(start, options.timeZone);
    if (start <= options.now) problems.push(`Offered a time in the past: ${when}.`);
    if (startMinutes >= OVERNIGHT_START || startMinutes < OVERNIGHT_END) {
      problems.push(`Offered an overnight time (9 PM–7 AM): ${when}.`);
    }
    if (!dayHours) {
      problems.push(`Offered a time on a day marked Closed (${parts.weekday}): ${when}.`);
    } else if (startMinutes < dayHours.open || endMinutes > dayHours.close) {
      problems.push(`Offered a time outside business hours: ${when}.`);
    }
    if (localDateKey(start, options.timeZone) === options.nextDay.date) onNextDay += 1;
  }
  if (options.slots.length === 0) {
    problems.push("checkAvailability offered no openings at all.");
  } else if (onNextDay === 0) {
    problems.push(`No opening on the next business day (${options.nextDay.date}, ${options.nextDay.weekday}) even though it has hours.`);
  }
  return [...new Set(problems)];
}

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Firestore not available" }, "noStore", { status: 503 });

  const now = Date.now();

  let businesses: Array<{ id: string; data: Record<string, unknown> }>;
  try {
    const snapshot = await db.collection("businesses").get();
    businesses = snapshot.docs
      .map((doc) => ({ id: doc.id, data: (doc.data() ?? {}) as Record<string, unknown> }))
      .filter(({ id, data }) => {
        const elevenLabs = data.elevenlabs as { agentId?: unknown } | undefined;
        return id === "demo-roofing" || typeof elevenLabs?.agentId === "string" || typeof data.vapiAssistantId === "string";
      });
  } catch (error) {
    console.error("Booking canary: businesses query failed:", error);
    return jsonWithCache({ error: "Failed to read businesses" }, "noStore", { status: 500 });
  }

  const results: BookingCheckIssue[] = [];

  for (const { id, data } of businesses) {
    const timeZone = typeof data.timezone === "string" && data.timezone.length > 0 ? data.timezone : DEFAULT_TZ;
    const hours = parseBusinessHours(data.businessHours);
    let problems: string[];
    let nextBusinessDay: string | null = null;

    if (!hours) {
      problems = ["Business hours are missing or could not be read."];
    } else {
      const nextDay = findNextBusinessDay(now, timeZone, hours);
      if (!nextDay) {
        problems = [`No open business day in the next ${SCAN_DAYS} days.`];
      } else {
        nextBusinessDay = nextDay.date;
        const [openCheck, preferredCheck] = await Promise.all([
          checkAvailability({ businessId: id, preferredDate: nextDay.date }),
          checkAvailability({ businessId: id, preferredDate: nextDay.date, preferredTime: "10:00 AM" }),
        ]);
        problems = openCheck.hoursStatus === "missing_or_invalid"
          ? ["checkAvailability could not read the business's hours."]
          : bookingProblems({
              now,
              timeZone,
              hours,
              nextDay,
              slots: [...openCheck.suggestedSlots, ...preferredCheck.suggestedSlots],
            });
      }
    }

    const clean = [...new Set(problems)];
    await db.collection("businesses").doc(id).set(
      { bookingCheck: { ok: clean.length === 0, checkedAt: now, problems: clean, nextBusinessDay } },
      { merge: true },
    );
    results.push({
      businessId: id,
      businessName: typeof data.businessName === "string" ? data.businessName : id,
      problems: clean,
    });
  }

  const failures = results.filter((entry) => entry.problems.length > 0);
  let emailStatus = "not_sent";
  if (failures.length > 0) {
    const items = failures
      .map((entry) => `<li><strong>${escapeHtml(entry.businessName)}</strong> (${escapeHtml(entry.businessId)}): ${entry.problems.map(escapeHtml).join("; ")}</li>`)
      .join("");
    const result = await sendEmail({
      to: PLATFORM_ALERT_TO,
      fromName: "Luxor CRM",
      subject: `[Alert] Booking canary failed for ${failures.length} business${failures.length === 1 ? "" : "es"}`,
      html: `<p style="margin:0 0 12px;font-size:15px;color:#334155;line-height:1.6">The daily booking canary could not confirm bookable times for the next business day. A caller would hear a bad answer until this is fixed.</p><ul style="margin:0;padding-left:18px;font-size:14px;color:#7f1d1d;line-height:1.7">${items}</ul>`,
    });
    emailStatus = result.status;
  }

  return jsonWithCache(
    { ok: failures.length === 0, checked: results.length, failures, emailStatus },
    "noStore",
  );
}
