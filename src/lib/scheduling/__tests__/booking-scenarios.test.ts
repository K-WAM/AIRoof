import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ db: null as FakeDb | null }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => mocks.db }));

import { executeAgentTool, type AgentToolContext } from "@/lib/tools/toolDispatcher";
import {
  buildAvailableSlots,
  isScheduleWithinBusinessHours,
} from "@/lib/tools/agentTools";
import { demoSeedFor } from "@/lib/verticals/demoSeed";

const BUSINESS_ID = "demo-roofing";
const TIME_ZONE = "America/New_York";
const CARLA_NOW = Date.parse("2026-09-27T20:59:21.000Z");
const HOUR = 60 * 60 * 1000;
const DEMO_HOURS = {
  Monday: "08:00 - 17:00",
  Tuesday: "08:00 - 17:00",
  Wednesday: "08:00 - 17:00",
  Thursday: "08:00 - 17:00",
  Friday: "08:00 - 17:00",
  Saturday: "Closed",
  Sunday: "Closed",
};

function context(callId: string, callerPhone = "+16892042643"): AgentToolContext {
  return { businessId: BUSINESS_ID, callId, callerPhone, provider: "elevenlabs" };
}

function seedRoofing(options: { crews?: number; hours?: unknown; now?: number; includeAppointments?: boolean } = {}) {
  const now = options.now ?? CARLA_NOW;
  const seed = demoSeedFor("roofing", now);
  const db = makeFakeDb();
  db.__seed("businesses", BUSINESS_ID, {
    businessName: "Summit Roofing",
    industry: "roofing",
    timezone: TIME_ZONE,
    businessHours: options.hours ?? DEMO_HOURS,
  });
  seed.resources.slice(0, options.crews ?? seed.resources.length).forEach((crew, index) => {
    db.__seed(`businesses/${BUSINESS_ID}/crews`, `crew-${index + 1}`, { ...crew, active: true });
  });
  if (options.includeAppointments !== false) {
    seed.appointments.forEach((appointment, index) => {
      db.__seed(`businesses/${BUSINESS_ID}/appointments`, `seed-${index + 1}`, {
        ...appointment,
        endTime: appointment.startTime + HOUR,
      });
    });
  }
  mocks.db = db;
  return { db, seed };
}

async function book(callId: string, startTime: string, callerPhone = `+1555${callId.replace(/\D/g, "").padStart(7, "0").slice(-7)}`) {
  return executeAgentTool("bookAppointment", {
    name: `Caller ${callId}`,
    serviceType: "Roof inspection",
    startTime,
  }, context(callId, callerPhone));
}

function localTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

function localDate(iso: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

describe("booking reliability truth table", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(CARLA_NOW);
    seedRoofing();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("S1 replays Carla's calls and books Monday at 8:00 AM", async () => {
    const mondayBooking = await book("s1-1", "2026-09-28T08:00", "+16892042643");
    const mondayCheck = await executeAgentTool("checkAvailability", {
      preferredDate: "2026-09-28",
      preferredTime: "10:00 AM",
    }, context("s1-2"));
    const tuesdayBooking = await book("s1-3", "2026-09-29T08:00", "+16892042644");
    const wednesdayCheck = await executeAgentTool("checkAvailability", {
      preferredDate: "2026-09-30",
      preferredTime: "8:00 AM",
    }, context("s1-4"));

    expect(mondayBooking.sayToCaller).toContain("Monday, September 28 at 8:00 AM");
    expect(mondayBooking.error).toBeUndefined();
    expect(tuesdayBooking.error).toBeUndefined();
    // Spec: no response may contain a time between 9 PM and 7 AM (Intl may put a narrow no-break space before AM/PM).
    const overnight = /\b(?:(?:9|10|11):\d{2}[\s ]*PM|(?:12|1|2|3|4|5|6):\d{2}[\s ]*AM)\b/;
    for (const response of [mondayBooking, mondayCheck, tuesdayBooking, wednesdayCheck]) {
      expect(`${response.result ?? ""} ${response.sayToCaller ?? ""}`).not.toMatch(overnight);
    }
  });

  it("S2 says the exact Monday 10:00 AM preference is open and lists it first", async () => {
    const result = await executeAgentTool("checkAvailability", {
      preferredDate: "2026-09-28",
      preferredTime: "10:00",
    }, context("s2"));
    expect(result.result).toMatch(/^10:00 AM Monday is open\./);
    expect(result.result).toContain("Closest openings: Monday 10:00 AM");
  });

  it("S3 returns three same-day alternatives when Monday 8:00 AM is at capacity", async () => {
    for (let index = 0; index < 5; index++) {
      expect((await book(`s3-${index}`, "2026-09-28T08:00", `+1555100000${index}`)).error).toBeUndefined();
    }
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const conflict = await book("s3-full", "2026-09-28T08:00", "+15551000009");
    expect(conflict.result).toBe("NOT BOOKED: 8:00 AM Monday was just taken. Nothing was booked for this caller. Offer them the closest openings: 9:00 AM, 9:30 AM or 10:00 AM.");
    expect(conflict.sayToCaller).toBe("Sorry, 8:00 AM Monday was just taken. The closest openings are 9:00 AM, 9:30 AM or 10:00 AM. Which works best for you?");
  });

  it("S4 offers next-business-day daytime slots after hours and flags the booking for confirmation", async () => {
    vi.setSystemTime("2026-09-28T01:00:00.000Z");
    const availability = await executeAgentTool("checkAvailability", {}, context("s4-check"));
    expect(availability.result).toContain("Monday 8:00 AM");
    expect(availability.result).not.toMatch(/closed|12:00 AM|1:00 AM/i);
    const booking = await book("s4-book", "2026-09-28T08:00", "+15552000004");
    // Phase 31: the words name the real opening; "first thing" is never said.
    expect(booking.sayToCaller).toBe("You're booked for Monday, September 28 at 8:00 AM. The office will call you when we open tomorrow at 8 AM to confirm it.");
    const stored = mocks.db!.__list(`businesses/${BUSINESS_ID}/appointments`).find((doc) => doc.data.sourceCallId === "s4-book");
    expect(stored?.data.bookedAfterHours).toBe(true);
    expect(stored?.data.pendingConfirmation).toBe(true);
  });

  it("S5 explains Saturday closure and offers Monday openings", async () => {
    const result = await executeAgentTool("checkAvailability", {
      preferredDate: "2026-10-03",
      preferredTime: "10:00 AM",
    }, context("s5"));
    expect(result.result).toMatch(/^We're closed Saturdays\./);
    expect(result.result).toContain("Monday 8:00 AM");
  });

  it("S6 reports Monday 6 PM outside hours with Monday 4 PM then Tuesday 8 AM", async () => {
    const result = await executeAgentTool("checkAvailability", {
      preferredDate: "2026-09-28",
      preferredTime: "18:00",
    }, context("s6"));
    expect(result.result).toContain("outside business hours");
    expect(result.result).toMatch(/Monday 4:00 PM; Tuesday 8:00 AM/);
  });

  it("S7 suppresses overnight slots for 24/7 hours unless 2:00 AM is requested", async () => {
    const roundTheClock = Object.fromEntries(Object.keys(DEMO_HOURS).map((day) => [day, "00:00 - 24:00"]));
    seedRoofing({ hours: roundTheClock, includeAppointments: false });
    const defaultResult = await executeAgentTool("checkAvailability", { preferredDate: "2026-09-28" }, context("s7-day"));
    expect(defaultResult.result).toMatch(/7:00 AM.*7:30 AM.*8:00 AM/);
    expect(defaultResult.result).not.toMatch(/9:00 PM|10:00 PM|11:00 PM|12:00 AM|1:00 AM|2:00 AM|3:00 AM|4:00 AM|5:00 AM|6:00 AM/);
    const overnight = await executeAgentTool("checkAvailability", {
      preferredDate: "2026-09-28",
      preferredTime: "2:00 AM",
    }, context("s7-night"));
    expect(overnight.result).toMatch(/^2:00 AM Monday is open\./);
    expect(overnight.result).toContain("Closest openings: Monday 2:00 AM");
  });

  it("S8 never offers a past time when today at 9 AM is requested at 4:59 PM", async () => {
    vi.setSystemTime("2026-09-28T20:59:21.000Z");
    const result = await executeAgentTool("checkAvailability", {
      preferredDate: "2026-09-28",
      preferredTime: "9:00 AM",
    }, context("s8"));
    expect(result.result).toContain("has already passed");
    expect(result.result).not.toContain("Closest openings: Monday at 9:00 AM");
  });

  it("S9 parses common hour formats and captures a lead for missing or garbage hours", async () => {
    const typedHours = Object.fromEntries(Object.keys(DEMO_HOURS).map((day) => [day, "8am-5pm"]));
    seedRoofing({ hours: typedHours, includeAppointments: false });
    expect((await executeAgentTool("checkAvailability", {
      preferredDate: "2026-09-28", preferredTime: "10am",
    }, context("s9-object"))).result).toContain("is open");

    seedRoofing({ hours: "Mon-Fri 8-5", includeAppointments: false });
    expect((await executeAgentTool("checkAvailability", {
      preferredDate: "2026-09-28", preferredTime: "10am",
    }, context("s9-string"))).result).toContain("is open");

    for (const [suffix, hours] of [["missing", undefined], ["garbage", "not hours"]] as const) {
      const { db } = seedRoofing({ hours: hours ?? "not hours", includeAppointments: false });
      if (suffix === "missing") db.__seed("businesses", BUSINESS_ID, { timezone: TIME_ZONE, industry: "roofing" });
      const result = await executeAgentTool("checkAvailability", {
        name: "Carla", serviceType: "Roof inspection",
      }, context(`s9-${suffix}`));
      expect(result.result).toContain("hours are not set up");
      expect(result.result).not.toContain("No openings");
      expect(db.__list(`businesses/${BUSINESS_ID}/leads`)).toHaveLength(1);
    }
  });

  it("S10 stores November 3 at 9 AM as 14:00Z after DST ends", async () => {
    vi.setSystemTime("2026-10-30T16:00:00.000Z");
    const result = await book("s10", "2026-11-03T09:00", "+15552000010");
    expect(result.error).toBeUndefined();
    const stored = mocks.db!.__list(`businesses/${BUSINESS_ID}/appointments`).find((doc) => doc.data.sourceCallId === "s10");
    expect(stored?.data.startTime).toBe(Date.parse("2026-11-03T14:00:00.000Z"));
  });

  it("S11 allows two crews to book Monday 10 AM and gives the third alternatives", async () => {
    seedRoofing({ crews: 2, includeAppointments: false });
    expect((await book("s11-1", "2026-09-28T10:00", "+15552000111")).error).toBeUndefined();
    expect((await book("s11-2", "2026-09-28T10:00", "+15552000112")).error).toBeUndefined();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const third = await book("s11-3", "2026-09-28T10:00", "+15552000113");
    expect(third.result).toMatch(/^NOT BOOKED: 10:00\s?AM Monday was just taken\..*closest openings:/);
  });

  it("S12 releases a cancelled capacity unit so the same slot can be booked again", async () => {
    seedRoofing({ crews: 2, includeAppointments: false });
    const phone = "+15552000121";
    await book("s12-a", "2026-09-28T10:00", phone);
    await book("s12-b", "2026-09-28T10:00", "+15552000122");
    const lookup = await executeAgentTool("lookupAppointment", {}, context("s12-cancel", phone));
    expect(lookup.result).toContain("Appointment 1");
    const cancellation = await executeAgentTool("cancelAppointment", { confirmCancellation: true }, context("s12-cancel", phone));
    expect(cancellation.sayToCaller).toContain("has been cancelled");
    expect((await book("s12-c", "2026-09-28T10:00", "+15552000123")).error).toBeUndefined();
  });

  it("S13 does not offer or book over a job for a one-crew business", async () => {
    const { db } = seedRoofing({ crews: 1, includeAppointments: false });
    db.__seed(`businesses/${BUSINESS_ID}/jobs`, "job-1", {
      scheduledStart: Date.parse("2026-09-28T14:00:00.000Z"),
      scheduledEnd: Date.parse("2026-09-28T15:00:00.000Z"),
      status: "inspection",
    });
    const availability = await executeAgentTool("checkAvailability", {
      preferredDate: "2026-09-28", preferredTime: "10:00 AM",
    }, context("s13-check"));
    expect(availability.result).toContain("is not open");
    expect(availability.result).not.toContain("Closest openings: Monday at 10:00 AM");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const booking = await book("s13-book", "2026-09-28T10:00", "+15552000133");
    expect(booking.result).toMatch(/^NOT BOOKED: 10:00\s?AM Monday was just taken\..*closest openings:/);
  });

  // ── Phase 31 (T-154) rows: plan docs/CALL-FLOW-FIX-PLAN.md §1–§2 ─────────────────────────────────────────────

  it("S15 an in-hours booking is not called 'after hours' and says how the office confirms (Carla, Mon 11:28 AM)", async () => {
    vi.setSystemTime("2026-09-28T15:28:00.000Z");
    seedRoofing({ includeAppointments: false });
    const withEmail = await executeAgentTool("bookAppointment", {
      callerName: "Carla Esnaida", serviceType: "Roof inspection", startTime: "2026-09-28T13:00", callerEmail: "carla@example.com", textOk: true,
    }, context("s15-email", "+13055550101"));
    expect(withEmail.sayToCaller).toBe("You're booked for Monday, September 28 at 1:00 PM. The office will confirm it by email shortly.");
    expect(`${withEmail.result} ${withEmail.sayToCaller}`).not.toMatch(/after hours|first thing|in the morning/i);
    expect(withEmail.result).toMatch(/^BOOKED: /);
    const noEmail = await executeAgentTool("bookAppointment", {
      callerName: "Luis", serviceType: "Roof inspection", startTime: "2026-09-28T14:00",
    }, context("s15-none", "+13055550102"));
    expect(noEmail.sayToCaller).toBe("You're booked for Monday, September 28 at 2:00 PM. The office will call you shortly to confirm it.");
    const stored = mocks.db!.__list(`businesses/${BUSINESS_ID}/appointments`).find((doc) => doc.data.sourceCallId === "s15-email");
    expect(stored?.data.bookedAfterHours).toBe(false);
    expect(stored?.data.textOk).toBe(true);
  });

  it("S16 an urgent leak gets the soonest opening; escalateCall is refused while escalation is off", async () => {
    vi.setSystemTime("2026-09-28T15:28:00.000Z");
    const { db } = seedRoofing({ includeAppointments: false });
    const soonest = await executeAgentTool("checkAvailability", {}, context("s16-check"));
    expect(soonest.result).toMatch(/^Available openings: Monday 11:30 AM/);
    const escalation = await executeAgentTool("escalateCall", { reason: "Water coming through the ceiling" }, context("s16-esc"));
    expect(escalation.result).toMatch(/^NOT ESCALATED: /);
    expect(escalation.result).toContain("URGENT:");
    expect(db.__list(`businesses/${BUSINESS_ID}/leads`)).toHaveLength(0);
    const booking = await executeAgentTool("bookAppointment", {
      callerName: "Carla Esnaida", serviceType: "Roof leak repair", startTime: "2026-09-28T11:30",
      notes: "URGENT: water coming through the kitchen ceiling",
    }, context("s16-book", "+13055550103"));
    expect(booking.error).toBeUndefined();
    expect(booking.result).toMatch(/^BOOKED: /);
  });

  it("S17 a time block is never booked — on an inspector row or on a crew", async () => {
    const { db } = seedRoofing({ crews: 0, includeAppointments: false });
    db.__seed(`businesses/${BUSINESS_ID}/crews`, "insp-dominic", { name: "Dominic", kind: "inspector", active: true, color: "#111", createdAt: 1 });
    db.__seed(`businesses/${BUSINESS_ID}/timeBlocks`, "block-1", {
      blockId: "block-1", businessId: BUSINESS_ID, crewId: "insp-dominic", label: "Site visit — St. Mary's",
      startTime: Date.parse("2026-09-28T14:00:00.000Z"), endTime: Date.parse("2026-09-28T16:00:00.000Z"), createdByUid: "u", createdAt: 1,
    });
    const check = await executeAgentTool("checkAvailability", { preferredDate: "2026-09-28", preferredTime: "10:00 AM" }, context("s17-check"));
    expect(check.result).toMatch(/^10:00 AM Monday is not open\./);
    expect(check.result).not.toMatch(/Closest openings: [^;]*(10:00|10:30|11:00|11:30) AM/);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const booking = await book("s17-book", "2026-09-28T10:00", "+15552000171");
    expect(booking.result).toMatch(/^NOT BOOKED: 10:00\s?AM Monday was just taken\./);
    expect((await book("s17-after", "2026-09-28T12:00", "+15552000172")).error).toBeUndefined();

    // Crews mode (no inspector rows): a block takes that crew out of the count.
    const crews = seedRoofing({ crews: 1, includeAppointments: false });
    crews.db.__seed(`businesses/${BUSINESS_ID}/timeBlocks`, "block-2", {
      crewId: "crew-1", label: "Materials pickup",
      startTime: Date.parse("2026-09-28T14:00:00.000Z"), endTime: Date.parse("2026-09-28T15:00:00.000Z"),
    });
    const crewCheck = await executeAgentTool("checkAvailability", { preferredDate: "2026-09-28", preferredTime: "10:00 AM" }, context("s17-crew"));
    expect(crewCheck.result).toMatch(/^10:00 AM Monday is not open\./);
  });

  it("S18 auto-assigns the first free inspector, skips a blocked one, and refuses when all are taken", async () => {
    const { db } = seedRoofing({ includeAppointments: false });
    db.__seed(`businesses/${BUSINESS_ID}/crews`, "insp-a", { name: "Dominic Reyes", kind: "inspector", active: true, color: "#111", createdAt: 1 });
    db.__seed(`businesses/${BUSINESS_ID}/crews`, "insp-b", { name: "Maria", kind: "inspector", active: true, color: "#222", createdAt: 2 });
    db.__seed(`businesses/${BUSINESS_ID}/crews`, "insp-off", { name: "Old", kind: "inspector", active: false, color: "#333", createdAt: 0 });
    const first = await book("s18-1", "2026-09-28T10:00", "+15552000181");
    expect(first.result).toContain("Dominic is scheduled for the visit");
    const second = await book("s18-2", "2026-09-28T10:00", "+15552000182");
    expect(second.result).toContain("Maria is scheduled for the visit");
    const stored = db.__list(`businesses/${BUSINESS_ID}/appointments`);
    expect(stored.find((doc) => doc.data.sourceCallId === "s18-1")?.data).toMatchObject({ assignedCrewId: "insp-a", assignedBy: "ai" });
    expect(stored.find((doc) => doc.data.sourceCallId === "s18-2")?.data).toMatchObject({ assignedCrewId: "insp-b", assignedBy: "ai" });
    expect(stored.find((doc) => doc.data.sourceCallId === "s18-1")?.data.scheduleCapacityUnit).toBeUndefined();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Five work crews are active, but inspections need an inspector: the third caller at 10 is refused.
    expect((await book("s18-3", "2026-09-28T10:00", "+15552000183")).result).toMatch(/^NOT BOOKED: /);

    // A block on the first inspector sends the next booking to the second.
    db.__seed(`businesses/${BUSINESS_ID}/timeBlocks`, "block-a", {
      crewId: "insp-a", label: "Office", startTime: Date.parse("2026-09-28T17:00:00.000Z"), endTime: Date.parse("2026-09-28T18:00:00.000Z"),
    });
    const blockedFirst = await book("s18-4", "2026-09-28T13:00", "+15552000184");
    expect(blockedFirst.result).toContain("Maria is scheduled");
  });

  it("S19 a job on a work crew does not take an inspector; an unassigned older booking still does", async () => {
    const { db } = seedRoofing({ includeAppointments: false });
    db.__seed(`businesses/${BUSINESS_ID}/crews`, "insp-a", { name: "Dominic", kind: "inspector", active: true, color: "#111", createdAt: 1 });
    db.__seed(`businesses/${BUSINESS_ID}/jobs`, "job-1", {
      scheduledStart: Date.parse("2026-09-28T14:00:00.000Z"), scheduledEnd: Date.parse("2026-09-28T15:00:00.000Z"), status: "in_progress", assignedCrewId: "crew-1",
    });
    expect((await book("s19-job", "2026-09-28T10:00", "+15552000191")).error).toBeUndefined();
    db.__seed(`businesses/${BUSINESS_ID}/appointments`, "old-unassigned", {
      startTime: Date.parse("2026-09-28T17:00:00.000Z"), endTime: Date.parse("2026-09-28T18:00:00.000Z"), status: "requested", pendingConfirmation: true,
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await book("s19-old", "2026-09-28T13:00", "+15552000192")).result).toMatch(/^NOT BOOKED: /);
  });

  it("S20 details given after booking are saved with addBookingNote; nothing to add to is NOT SAVED", async () => {
    seedRoofing({ includeAppointments: false });
    const before = await executeAgentTool("addBookingNote", { note: "Access: gate code 1010" }, context("s20", "+15552000201"));
    expect(before.result).toMatch(/^NOT SAVED: /);
    await executeAgentTool("bookAppointment", {
      callerName: "Es Carla Esnaida", serviceType: "Roof inspection", startTime: "2026-09-28T10:00", notes: "URGENT: active leak",
    }, context("s20", "+15552000201"));
    const saved = await executeAgentTool("addBookingNote", { note: "Access: gate code 1010" }, context("s20", "+15552000201"));
    expect(saved.result).toMatch(/^SAVED: /);
    await executeAgentTool("addBookingNote", { note: "Access: gate code 1010" }, context("s20", "+15552000201"));
    const stored = mocks.db!.__list(`businesses/${BUSINESS_ID}/appointments`).find((doc) => doc.data.sourceCallId === "s20");
    expect(stored?.data.notes).toBe("URGENT: active leak\nAccess: gate code 1010");
    // "Es" is Spanish for "it's" — never part of the name (the outbound call said "Hi Es").
    expect(stored?.data.callerName).toBe("Carla Esnaida");
    // Another call can never write onto this booking.
    expect((await executeAgentTool("addBookingNote", { note: "x" }, context("s20-other", "+15552000299"))).result).toMatch(/^NOT SAVED: /);
  });

  it("S21 a spoken email becomes an address; one that still isn't is dropped (confirmation email can't bounce)", async () => {
    seedRoofing({ includeAppointments: false });
    const spoken = await executeAgentTool("bookAppointment", {
      callerName: "Carla Snyder", serviceType: "Roof inspection", startTime: "2026-09-28T10:00", callerEmail: "carla at example dot com",
    }, context("s21-a", "+15552000211"));
    expect(spoken.sayToCaller).toContain("by email");
    await executeAgentTool("bookAppointment", {
      callerName: "Luis", serviceType: "Roof inspection", startTime: "2026-09-28T11:00", callerEmail: "luis at gmail",
    }, context("s21-b", "+15552000212"));
    const stored = mocks.db!.__list(`businesses/${BUSINESS_ID}/appointments`);
    expect(stored.find((doc) => doc.data.sourceCallId === "s21-a")?.data.callerEmail).toBe("carla@example.com");
    expect(stored.find((doc) => doc.data.sourceCallId === "s21-b")?.data.callerEmail).toBeUndefined();
  });

  it("S14 leaves six morning openings on each of the next three business days at every launch hour", () => {
    for (let launchHour = 0; launchHour < 24; launchHour++) {
      const launchNow = Date.UTC(2026, 8, 27, launchHour + 4);
      const seed = demoSeedFor("roofing", launchNow);
      const existing = seed.appointments.map((appointment) => ({
        startTime: appointment.startTime,
        endTime: appointment.startTime + HOUR,
        status: appointment.status,
      }));
      expect(existing.every((item) => isScheduleWithinBusinessHours(
        item.startTime, item.endTime, DEMO_HOURS, TIME_ZONE
      ))).toBe(true);

      for (const preferredDate of ["2026-09-28", "2026-09-29", "2026-09-30"]) {
        const slots = buildAvailableSlots({
          businessHours: DEMO_HOURS,
          timeZone: TIME_ZONE,
          existing,
          capacity: seed.resources.length,
          preferredDate,
          now: new Date(launchNow),
          maxSlots: 40,
        }).filter((slot) => localDate(slot.startTime) === preferredDate && [
          "8:00 AM", "8:30 AM", "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
        ].includes(localTime(slot.startTime)));
        expect(slots.length, `launch hour ${launchHour}, ${preferredDate}`).toBeGreaterThanOrEqual(6);
      }
    }
  });
});
