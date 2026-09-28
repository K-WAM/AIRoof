import { describe, expect, it } from "vitest";
import { isEscalationEnabled } from "../escalation";
import { VERTICAL_TEMPLATES, type VerticalId } from "@/lib/verticals/templates";

describe("isEscalationEnabled (plan §2.1)", () => {
  it("is off by default for field trades — a roofing leak is booked, not escalated", () => {
    expect(isEscalationEnabled({ industry: "roofing" })).toBe(false);
    expect(isEscalationEnabled({ industry: "hvac" })).toBe(false);
  });

  it("is on by default for every care and property vertical, derived from the template family", () => {
    for (const [id, template] of Object.entries(VERTICAL_TEMPLATES)) {
      expect(isEscalationEnabled({ industry: id as VerticalId }), id).toBe(template.family !== "field");
    }
    expect(isEscalationEnabled({ industry: "daycares" })).toBe(true);
  });

  it("follows the business's own switch either way", () => {
    expect(isEscalationEnabled({ industry: "roofing", escalationEnabled: true })).toBe(true);
    expect(isEscalationEnabled({ industry: "daycares", escalationEnabled: false })).toBe(false);
  });

  it("is off for an unknown industry unless the business turns it on", () => {
    expect(isEscalationEnabled({})).toBe(false);
    expect(isEscalationEnabled({ industry: "unknown-vertical" })).toBe(false);
  });
});
