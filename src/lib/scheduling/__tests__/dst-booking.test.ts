import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ db: null as FakeDb | null, send: vi.fn() }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => mocks.db }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: async () => ({ user: { uid: "office", role: "staff" } }) }));
// Capture rendered mail at the delivery boundary; never contact any provider.
vi.mock("@/lib/comms/send", () => ({
  sendEmail: mocks.send, sendWithLedger: mocks.send, isCommsConfigured: () => true,
}));

import { executeAgentTool } from "@/lib/tools/toolDispatcher";
import { buildAvailableSlots } from "@/lib/tools/agentTools";
import { dayWindow, isOpenAt, WEEKDAYS, zonedDateTimeToUtc } from "@/lib/scheduling/hours";
import { fmtDayTime, fmtTime, dayKey } from "@/lib/format/datetime";
import { openStartTimes } from "@/lib/calendar/openTimes";
import { buildInspectorFeed, icsUtc } from "@/lib/calendar/ics";
import { buildInitiationResponse } from "@/lib/voice/elevenlabs/initiationConfig";
import { POST as sendConfirmation } from "@/app/api/appointments/send-confirmation/route";

const businessId = "dst-business";
const HOUR = 60 * 60 * 1000;
const hours = Object.fromEntries(WEEKDAYS.map((day) => [day, "00:00 - 23:59"]));
// Independent expected UTC offsets, including the actual 2027 spring change (March 14).
// March 7/8/9 are retained as requested: all three are still standard time in 2027.
const dates = [
  ["2026-10-31", 4, 7], ["2026-11-01", 5, 8], ["2026-11-02", 5, 8],
  ["2026-11-03", 5, 8], ["2026-11-04", 5, 8],
  ["2027-03-07", 5, 8], ["2027-03-08", 5, 8], ["2027-03-09", 5, 8],
  ["2027-03-13", 5, 8], ["2027-03-14", 4, 7], ["2027-03-15", 4, 7],
] as const;
const zones = ["America/New_York", "America/Los_Angeles", "America/Phoenix"] as const;
const rows = dates.flatMap(([date, eastern, pacific]) => zones.flatMap((zone) => [9, 11].map((hour) => {
  const offset = zone === "America/New_York" ? eastern : zone === "America/Los_Angeles" ? pacific : 7;
  return { date, zone, hour, utc: `${date}T${String(hour + offset).padStart(2, "0")}:00:00.000Z` };
})));

function seed(zone: string) {
  const db = makeFakeDb();
  db.__seed("businesses", businessId, {
    businessName: "DST Roofing", industry: "roofing", timezone: zone, businessHours: hours,
    notificationEmail: "office@example.test",
  });
  mocks.db = db;
  return db;
}

async function bookAndCheck(input: string, zone: string, expectedUtc: string, label: string) {
  const db = seed(zone);
  const result = await executeAgentTool("bookAppointment", {
    callerName: "Pat", callerEmail: "pat@example.test", serviceType: "Inspection", startTime: input,
  }, { businessId, callId: "dst-call", callerPhone: "+15551234567", provider: "elevenlabs" });
  expect(result.error).toBeUndefined();
  const [stored] = db.__list(`businesses/${businessId}/appointments`);
  const start = stored.data.startTime as number;
  expect(new Date(start).toISOString()).toBe(expectedUtc);
  expect(stored.data.endTime).toBe(start + HOUR);
  expect(result.sayToCaller).toContain(label);
  // Shared job display formatter, also exercise its cached formatter across DST dates.
  expect(fmtTime(start, zone)).toBe(label);
  expect(fmtDayTime(start, zone)).toContain(label);
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ html: expect.stringContaining(label) }));
  mocks.send.mockClear();
  const response = await sendConfirmation(new NextRequest("http://localhost/api/appointments/send-confirmation", {
    method: "POST", body: JSON.stringify({ businessId, appointmentId: stored.id }),
  }));
  expect(response.status).toBe(200);
  // Both customer confirmation and office copy, rendered by the real route/templates.
  expect(mocks.send).toHaveBeenCalledTimes(2);
  for (const [email] of mocks.send.mock.calls) expect(email.html).toContain(label);
  expect(buildInspectorFeed({
    calendarName: "Visits", bookings: [{ appointmentId: stored.id, startTime: start }],
    blocks: [], fieldUrl: "http://localhost/field", now: Date.now(),
  })).toContain(`DTSTART:${icsUtc(Date.parse(expectedUtc))}`);
  return start;
}

describe("T-290 booking DST truth table (real dispatcher, persistence, email and feed)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.send.mockResolvedValue({ status: "delivered" });
  });
  afterEach(() => { vi.useRealTimers(); });

  it.each(rows)("$zone $date $hour:00 local survives every boundary", async ({ date, zone, hour, utc }) => {
    // Call before the change, book after it: catches accidentally cached current offsets.
    vi.setSystemTime(date.startsWith("2026") ? "2026-10-30T12:00:00Z" : "2027-03-06T12:00:00Z");
    const label = `${hour}:00 AM`;
    const start = await bookAndCheck(`${date}T${String(hour).padStart(2, "0")}:00`, zone, utc, label);
    expect(dayKey(start, zone)).toBe(date);
    const window = dayWindow(start, zone, hours)!;
    expect(isOpenAt(start, zone, hours)).toBe(true);
    expect(openStartTimes({ window, busy: [], durationMs: HOUR })).toContain(start);
    const available = buildAvailableSlots({
      businessHours: hours, timeZone: zone, existing: [], preferredDate: date,
      preferredTime: `${hour}:00`, now: new Date(), maxSlots: 3,
    });
    expect(available[0].startTime).toBe(utc);
    // Initiation supplies fresh business-local date/time, without changing any live agent.
    const response = buildInitiationResponse({
      businessId, businessName: "DST Roofing", industry: "roofing", serviceArea: "Local", timezone: zone,
      businessHours: hours, emergencyRules: [], bookingRules: [], approvedServices: [],
      approvedFaqs: [], disallowedTopics: [], active: true, createdAt: 1, updatedAt: 1,
    }, "+15551234567", new Date(start));
    expect(response.dynamic_variables.currentTime).toBe(label);
    const [year, month, day] = date.split("-");
    const monthName = ({ "03": "March", "10": "October", "11": "November" } as Record<string, string>)[month];
    expect(response.dynamic_variables.currentDate).toContain(`${monthName} ${Number(day)}, ${year}`);
  });

  it.each([
    ["America/New_York", "", "2026-11-01T05:30:00.000Z"],
    ["America/New_York", "-04:00", "2026-11-01T05:30:00.000Z"],
    ["America/New_York", "-05:00", "2026-11-01T06:30:00.000Z"],
    ["America/New_York", "-0500", "2026-11-01T06:30:00.000Z"],
    ["America/Los_Angeles", "", "2026-11-01T08:30:00.000Z"],
    ["America/Los_Angeles", "-08:00", "2026-11-01T09:30:00.000Z"],
    ["America/Los_Angeles", "-0800", "2026-11-01T09:30:00.000Z"],
    ["America/Phoenix", "", "2026-11-01T08:30:00.000Z"],
  ])("%s repeated 01:30 with offset '%s'", async (zone, suffix, utc) => {
    vi.setSystemTime("2026-10-30T12:00:00Z");
    // Bare ambiguous wall times keep the existing earlier-occurrence policy; explicit offsets select either.
    await bookAndCheck(`2026-11-01T01:30${suffix}`, zone, utc, "1:30 AM");
  });

  it.each(zones)("%s does not invent a spring-gap time", (zone) => {
    const result = zonedDateTimeToUtc({ year: 2027, month: 3, day: 14, hour: 2, minute: 30 }, zone);
    expect(result).toBe(zone === "America/Phoenix" ? Date.parse("2027-03-14T09:30:00Z") : null);
  });
});
