import { describe, expect, it } from "vitest";
import { VERTICAL_TEMPLATES, type VerticalId } from "../templates";
import { demoSeedFor } from "../demoSeed";

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
});
