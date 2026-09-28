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
    expect(`${mondayCheck.result} ${wednesdayCheck.result}`).not.toMatch(/12:00 AM|12:30 AM|1:00 AM/);
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
    expect(conflict.result).toBe("8:00 AM Monday is booked. The closest openings are 9:00 AM, 9:30 AM or 10:00 AM.");
  });

  it("S4 offers next-business-day daytime slots after hours and flags the booking for confirmation", async () => {
    vi.setSystemTime("2026-09-28T01:00:00.000Z");
    const availability = await executeAgentTool("checkAvailability", {}, context("s4-check"));
    expect(availability.result).toContain("Monday 8:00 AM");
    expect(availability.result).not.toMatch(/closed|12:00 AM|1:00 AM/i);
    const booking = await book("s4-book", "2026-09-28T08:00", "+15552000004");
    expect(booking.sayToCaller).toContain("office will confirm first thing");
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
    expect(third.result).toContain("is booked. The closest openings are");
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
    expect(booking.result).toContain("is booked. The closest openings are");
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
