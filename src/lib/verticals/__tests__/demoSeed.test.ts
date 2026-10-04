import { describe, expect, it } from "vitest";
import { VERTICAL_TEMPLATES, type VerticalId } from "../templates";
import { demoSeedFor } from "../demoSeed";
import { buildAvailableSlots, isScheduleWithinBusinessHours } from "@/lib/tools/agentTools";
import { zonedDateTimeToUtc } from "@/lib/scheduling/hours";

const VERTICAL_IDS = Object.keys(VERTICAL_TEMPLATES) as VerticalId[];

describe("demoSeedFor call transcripts", () => {
  it("gives every vertical deterministic, well-formed seeded calls", () => {
    for (const verticalId of VERTICAL_IDS) {
      const seed = demoSeedFor(verticalId);
      const ids = seed.calls.map((call) => call.callId);

      expect(new Set(ids).size, verticalId).toBe(ids.length);
      for (const call of seed.calls) {
        expect(call.callId, verticalId).toMatch(/^call_demo_\d+$/);
        expect(call.durationSecs, verticalId).toBeGreaterThan(0);
        expect(call.messages.length, verticalId).toBeGreaterThanOrEqual(3);
        expect(call.messages.length, verticalId).toBeLessThanOrEqual(5);
        expect(call.messages[0].role, verticalId).toBe("agent");
        for (const message of call.messages) {
          expect(["caller", "agent"], verticalId).toContain(message.role);
          expect(message.text.trim().length, verticalId).toBeGreaterThan(0);
        }
      }
    }
  });

  it("uses each vertical's own service vocabulary (no cross-industry words)", () => {
    for (const verticalId of VERTICAL_IDS) {
      const seed = demoSeedFor(verticalId);
      const services = VERTICAL_TEMPLATES[verticalId].approvedServices;

      for (const call of seed.calls) {
        expect(
          services.includes(call.serviceType) || call.serviceType === "General inquiry",
          `${verticalId}:${call.serviceType}`
        ).toBe(true);
      }

      if (verticalId !== "roofing") {
        const transcript = seed.calls.flatMap((call) => call.messages.map((m) => m.text)).join(" ");
        expect(transcript, verticalId).not.toMatch(/\broof|shingle|gutter/i);
      }
    }
  });

  it("links seeded leads/appointments to a call they actually match", () => {
    for (const verticalId of VERTICAL_IDS) {
      const seed = demoSeedFor(verticalId);
      const byCallId = new Map(seed.calls.map((call) => [call.callId, call]));

      const linked = [
        ...seed.leads.filter((lead) => lead.sourceCallId),
        ...seed.appointments.filter((appt) => appt.sourceCallId),
      ];
      // Every vertical must have at least one "This call produced" link to demo.
      expect(linked.length, verticalId).toBeGreaterThan(0);

      for (const record of linked) {
        const call = byCallId.get(record.sourceCallId!);
        expect(call, `${verticalId}:${record.sourceCallId}`).toBeDefined();
        // The call really is the one that produced the record: same caller.
        expect(call!.callerPhone, `${verticalId}:${record.sourceCallId}`).toBe(record.callerPhone);
      }
    }
  });

  it("is deterministic for a fixed seed time", () => {
    const at = Date.UTC(2026, 8, 26);
    const first = demoSeedFor("hvac", at);
    const second = demoSeedFor("hvac", at);
    expect(first.calls).toEqual(second.calls);
    expect(first.appointments).toEqual(second.appointments);
  });

  it("keeps roofing seed data inside hours and leaves six morning openings across launch hours", () => {
    const businessHours = {
      Monday: "08:00 - 17:00", Tuesday: "08:00 - 17:00", Wednesday: "08:00 - 17:00",
      Thursday: "08:00 - 17:00", Friday: "08:00 - 17:00", Saturday: "Closed", Sunday: "Closed",
    };
    const timeZone = "America/New_York";
    for (let launchHour = 0; launchHour < 24; launchHour++) {
      const now = zonedDateTimeToUtc({ year: 2026, month: 9, day: 27, hour: launchHour, minute: 0 }, timeZone)!;
      const seed = demoSeedFor("roofing", now);
      const existing = seed.appointments.map((appointment) => ({
        startTime: appointment.startTime,
        endTime: appointment.startTime + 60 * 60_000,
        status: appointment.status,
      }));
      expect(existing.every((appointment) => isScheduleWithinBusinessHours(
        appointment.startTime, appointment.endTime, businessHours, timeZone
      )), `launch hour ${launchHour}`).toBe(true);

      for (const preferredDate of ["2026-09-28", "2026-09-29", "2026-09-30"]) {
        const slots = buildAvailableSlots({
          businessHours, timeZone, preferredDate, existing,
          capacity: seed.resources.length, now: new Date(now), maxSlots: 100,
        }).filter((slot) => new Intl.DateTimeFormat("en-CA", {
          timeZone, year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date(slot.startTime)).replace(/\//g, "-") === preferredDate);
        const morning = slots.filter((slot) => {
          const hour = Number(new Intl.DateTimeFormat("en-US", {
            timeZone, hour: "2-digit", hourCycle: "h23",
          }).format(new Date(slot.startTime)));
          return hour >= 8 && hour < 12;
        });
        expect(morning.length, `launch hour ${launchHour}, ${preferredDate}`).toBeGreaterThanOrEqual(6);
      }
    }
  }, 20_000); // heavy loop over every launch hour: ~4 s alone, flaked at the 5 s default under the full parallel run
});
