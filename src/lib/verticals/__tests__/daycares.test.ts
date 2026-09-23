import { describe, expect, it } from "vitest";
import { VERTICAL_TEMPLATES } from "../templates";
import { demoSeedFor } from "../demoSeed";
import { buildAgentPrompt } from "@/lib/ai/agentPromptBuilder";
import type { BusinessConfig } from "@/types";

// T-099 — the daycares vertical's safety boundaries. Licensed centers are a
// capacity/ratio-constrained, licensing-regulated business, so the agent must
// be as disciplined about child safety/privacy as dental is about PHI. These
// tests are negative-first: each one asserts something the agent must refuse
// to do, then the positive shape (tours onto directors, not sitters) and the
// prompt/seed plumbing.
const t = VERTICAL_TEMPLATES.daycares;

function daycaresConfig(): BusinessConfig {
  return {
    businessId: "biz-daycares",
    businessName: "Sunshine Daycare Center",
    industry: "daycares",
    serviceArea: "Miami",
    businessHours: "Mon-Fri 6:30am-6pm",
    emergencyRules: t.emergencyRules,
    bookingRules: t.bookingRules,
    approvedServices: t.approvedServices,
    approvedFaqs: t.approvedFaqs,
    disallowedTopics: t.disallowedTopics,
    agentName: t.agentName,
    agentIdentity: t.agentIdentity,
    agentTone: t.agentTone,
    active: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

const topics = t.disallowedTopics.join(" ").toLowerCase();
const rules = t.emergencyRules.join(" ").toLowerCase();

describe("daycares vertical — disallowed topics (negative-first)", () => {
  it("refuses to arrange or authorize release of a child to any caller", () => {
    expect(topics).toMatch(/release of a child/);
    expect(topics).toMatch(/verified by staff in person only/);
  });

  it("refuses to confirm or deny a specific child's presence to an unverified caller", () => {
    expect(topics).toMatch(/confirming or denying that a specific child is at the center/);
    expect(topics).toMatch(/unverified caller/);
  });

  it("refuses to discuss a named child's health, behavior, or daily-report details", () => {
    expect(topics).toMatch(/a named child's health, behavior/);
    expect(topics).toMatch(/daily-report/);
  });
});

describe("daycares vertical — emergency rules", () => {
  it("escalates child injury or allergic reaction immediately to on-site staff", () => {
    expect(rules).toMatch(/injury or allergic reaction/);
    expect(rules).toMatch(/escalate immediately to on-site staff/);
    expect(rules).toMatch(/911/);
  });

  it("escalates unauthorized-pickup attempts and never confirms or denies presence", () => {
    expect(rules).toMatch(/unauthorized pickup/);
    expect(rules).toMatch(/never confirm or deny/);
  });

  it("treats an unaccounted-for child as urgent, immediate escalation", () => {
    expect(rules).toMatch(/unaccounted-for child/);
    expect(rules).toMatch(/urgent/);
  });
});

describe("daycares vertical — distinct from childcare", () => {
  it("is a separate template with its own VerticalId and resource noun", () => {
    expect(t.verticalId).not.toBe(VERTICAL_TEMPLATES.childcare.verticalId);
    expect(t.vocab.resourceNoun).toBe("Director");
    expect(t.vocab.resourceNoun).not.toMatch(/sitter/i);
    expect(t.vocab.resourceNoun).not.toBe(VERTICAL_TEMPLATES.childcare.vocab.resourceNoun);
    expect(t.vocab.jobNoun).not.toBe(VERTICAL_TEMPLATES.childcare.vocab.jobNoun);
  });

  it("has its own agent name, color, and icon", () => {
    const other = VERTICAL_TEMPLATES.childcare;
    expect(t.agentName).not.toBe(other.agentName);
    expect(t.color).not.toBe(other.color);
    expect(t.icon).not.toBe(other.icon);
  });

  it("uses a color no other vertical template shares", () => {
    const others = Object.values(VERTICAL_TEMPLATES)
      .filter((v) => v.verticalId !== "daycares")
      .map((v) => v.color);
    expect(others).not.toContain(t.color);
  });

  it("keeps the intake shape: appointments onto directors, jobs and pricing disabled", () => {
    expect(t.calendarMode).toBe("appointments");
    expect(t.family).toBe("care");
    expect(t.disabledModules).toEqual(["jobs", "pricing"]);
  });
});

describe("buildAgentPrompt for daycares", () => {
  const prompt = buildAgentPrompt(daycaresConfig());

  it("carries the pickup-release boundary into the agent prompt", () => {
    expect(prompt).toContain("release of a child");
    expect(prompt).toContain("verified by staff in person only");
  });

  it("carries the child-presence boundary into the agent prompt", () => {
    expect(prompt).toContain("confirming or denying that a specific child is at the center");
    expect(prompt).toContain("unverified caller");
  });

  it("carries the named-child health/behavior boundary into the agent prompt", () => {
    expect(prompt).toContain("a named child's health, behavior");
  });

  it("carries the emergency escalation rules into the agent prompt", () => {
    expect(prompt).toContain("unauthorized pickup");
    expect(prompt).toContain("unaccounted-for child");
  });
});

describe('demoSeedFor("daycares")', () => {
  const seed = demoSeedFor("daycares");

  it("seeds resources and appointment rows so the Calendar is non-empty", () => {
    expect(seed.resources.length).toBeGreaterThan(0);
    expect(seed.appointments.length).toBeGreaterThan(0);
  });

  it("seeds draggable/unassigned appointments", () => {
    expect(seed.appointments.some((a) => a.resourceIndex === undefined)).toBe(true);
  });

  it("seeds an after-hours pendingConfirmation booking with an email", () => {
    expect(
      seed.appointments.some((a) => a.pendingConfirmation === true && Boolean(a.callerEmail))
    ).toBe(true);
  });
});
