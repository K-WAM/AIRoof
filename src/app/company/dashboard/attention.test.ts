import { describe, expect, it } from "vitest";
import { ATTENTION_WAITING_MS, attentionReason, needsAttention } from "./attention";

const now = Date.UTC(2026, 10, 5, 12);
const hoursAgo = (hours: number) => now - hours * 3_600_000;
const lead = (overrides: Parameters<typeof attentionReason>[0]) => ({ status: "new", createdAt: hoursAgo(1), ...overrides });

describe("attentionReason", () => {
  it("leaves a routine new request alone for the first four hours", () => {
    expect(attentionReason(lead({ createdAt: now }), now)).toBeNull();
    expect(attentionReason(lead({ createdAt: hoursAgo(1) }), now)).toBeNull();
    expect(needsAttention(lead({ createdAt: hoursAgo(3.9) }), now)).toBe(false);
  });

  it("names a request that has waited longer than four hours", () => {
    expect(attentionReason(lead({ createdAt: hoursAgo(4.1) }), now)).toBe("Waiting 4 h");
    expect(attentionReason(lead({ createdAt: hoursAgo(6) }), now)).toBe("Waiting 6 h");
  });

  it("does not flag a request at exactly the four-hour mark", () => {
    expect(attentionReason(lead({ createdAt: now - ATTENTION_WAITING_MS }), now)).toBeNull();
  });

  it("names urgent and escalated requests at once", () => {
    expect(attentionReason(lead({ urgency: "urgent", createdAt: now }), now)).toBe("Urgent request");
    expect(attentionReason(lead({ urgency: "Urgent", createdAt: now }), now)).toBe("Urgent request");
    expect(attentionReason(lead({ urgency: "normal", escalated: true, createdAt: now }), now)).toBe("Emergency call");
  });

  it("names a requested call back before it has waited", () => {
    expect(attentionReason(lead({ callbackState: "pending", createdAt: now }), now)).toBe("Caller asked for a call back");
    expect(attentionReason(lead({ callbackConsent: true, createdAt: now }), now)).toBe("Caller asked for a call back");
  });

  it("prefers the sharper reason when several rules match", () => {
    expect(attentionReason(lead({ urgency: "urgent", callbackState: "pending", createdAt: hoursAgo(8) }), now)).toBe("Urgent request");
    expect(attentionReason(lead({ escalated: true, urgency: "urgent", createdAt: hoursAgo(8) }), now)).toBe("Emergency call");
  });

  it("ignores requests that are no longer open", () => {
    for (const status of ["contacted", "booked", "closed", "lost"]) {
      expect(attentionReason(lead({ status, urgency: "urgent", createdAt: hoursAgo(10) }), now)).toBeNull();
    }
  });

  it("does not guess when a request has no creation time", () => {
    expect(attentionReason({ status: "new" }, now)).toBeNull();
    expect(attentionReason({ status: "new", urgency: "low" }, now)).toBeNull();
  });
});
