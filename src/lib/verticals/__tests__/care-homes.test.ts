import { describe, expect, it } from "vitest";
import type { BusinessConfig } from "@/types";
import { buildAgentPrompt } from "@/lib/ai/agentPromptBuilder";
import { demoSeedFor } from "../demoSeed";
import { VERTICAL_TEMPLATES } from "../templates";

const careHomes = VERTICAL_TEMPLATES["care-homes"];

describe("T-098 Care Homes front-office boundaries", () => {
  it("refuses resident health, medication, diagnosis, and named-resident confirmation requests", () => {
    const forbidden = careHomes.disallowedTopics.join("\n");
    expect(forbidden).toMatch(/resident health status|resident condition/i);
    expect(forbidden).toMatch(/medication/i);
    expect(forbidden).toMatch(/diagnosis|care advice/i);
    expect(forbidden).toMatch(/never confirm or deny whether a named person is a resident/i);
    expect(forbidden).toMatch(/live staff/i);
  });

  it("escalates falls, elopement, and alleged neglect without handling the facts", () => {
    const rules = careHomes.emergencyRules.join("\n");
    expect(rules).toMatch(/fall|injury|unresponsive/i);
    expect(rules).toMatch(/immediately/i);
    expect(rules).toMatch(/911/i);
    expect(rules).toMatch(/missing resident|elopement/i);
    expect(rules).toMatch(/care-quality complaint|alleged neglect/i);
    expect(rules).toMatch(/administrator/i);
    expect(rules).toMatch(/do not.*resolve|do not.*apologize/i);
  });

  it("puts the privacy and escalation rules into the live agent prompt", () => {
    const config: BusinessConfig = {
      businessId: "care-demo",
      businessName: "Harbor House",
      industry: "care-homes",
      serviceArea: "Miami",
      businessHours: "Mon-Fri 9-5",
      approvedServices: careHomes.approvedServices,
      approvedFaqs: careHomes.approvedFaqs,
      emergencyRules: careHomes.emergencyRules,
      bookingRules: careHomes.bookingRules,
      disallowedTopics: careHomes.disallowedTopics,
      agentName: careHomes.agentName,
      agentIdentity: careHomes.agentIdentity,
      agentTone: careHomes.agentTone,
      active: true,
      createdAt: 0,
      updatedAt: 0,
    };
    const prompt = buildAgentPrompt(config);
    for (const rule of [...careHomes.emergencyRules, ...careHomes.disallowedTopics]) {
      expect(prompt).toContain(rule);
    }
    expect(prompt).toContain("Harbor House");
  });

  it("seeds coordinator rows, draggable tours, and an emailed after-hours approval", () => {
    expect(careHomes.calendarMode).toBe("appointments");
    expect(careHomes.family).toBe("care");
    expect(careHomes.disabledModules).toEqual(["jobs", "pricing"]);

    const seed = demoSeedFor("care-homes", Date.UTC(2026, 8, 23));
    expect(seed.resources).toHaveLength(5);
    expect(seed.appointments.length).toBeGreaterThan(0);
    expect(seed.appointments.some((a) => a.resourceIndex === undefined)).toBe(true);
    expect(seed.appointments.some((a) => a.pendingConfirmation && a.callerEmail)).toBe(true);
    expect(seed.jobs).toHaveLength(0);
  });
});
