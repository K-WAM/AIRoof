import { describe, it, expect } from "vitest";
import { buildAgentPrompt } from "../agentPromptBuilder";
import type { BusinessConfig } from "@/types";
import { VERTICAL_TEMPLATES } from "@/lib/verticals/templates";

function config(overrides: Partial<BusinessConfig> = {}): BusinessConfig {
  return {
    businessId: "biz1", businessName: "Apex Roofing", industry: "roofing",
    serviceArea: "Miami", businessHours: "Mon-Fri 8-5",
    emergencyRules: [], bookingRules: [], approvedServices: [], approvedFaqs: [],
    disallowedTopics: [], active: true, createdAt: 0, updatedAt: 0,
    ...overrides,
  };
}

describe("buildAgentPrompt — Language section (Phase 12, Phase 6)", () => {
  it("defaults to English with no bilingual switching instruction", () => {
    const prompt = buildAgentPrompt(config());
    expect(prompt).toContain("## Language");
    expect(prompt).toContain("Greet and answer in English.");
    expect(prompt).not.toContain("If the caller speaks Spanish, switch and stay there");
  });

  it("greets in Spanish when agentLanguage is es, still without the bilingual switch line", () => {
    const prompt = buildAgentPrompt(config({ agentLanguage: "es" }));
    expect(prompt).toContain("Greet and answer in Spanish.");
    expect(prompt).not.toContain("If the caller speaks Spanish, switch and stay there");
  });

  it("adds the bilingual switching instruction only when both languages are enabled", () => {
    const prompt = buildAgentPrompt(config({ agentLanguage: "en", agentLanguages: ["en", "es"] }));
    expect(prompt).toContain("If the caller speaks Spanish, switch and stay there");
  });

  it("always tells the agent to record the caller's own words untranslated — the opposite rule from the field-update path", () => {
    const prompt = buildAgentPrompt(config());
    expect(prompt).toContain("do NOT translate the customer's own words into English");
  });

  it("places Language before Response Style so the tone rules apply to whichever language is active", () => {
    const prompt = buildAgentPrompt(config());
    expect(prompt.indexOf("## Language")).toBeLessThan(prompt.indexOf("## Response Style"));
  });
});

// T-100 — structured per-industry intake. The section comes from the vertical
// template (not hardcoded), instructs the agent to collect the fields
// conversationally, never stalls on them, and records answers as parseable
// "Label: value" lines inside the existing "notes" parameter — the Vapi tool
// schema cannot change (NH-1), so intake must ride through notes.
function intakeSectionOf(industry: string): string {
  const prompt = buildAgentPrompt(config({ industry }));
  const start = prompt.indexOf("## Intake Details");
  if (start === -1) return "";
  const end = prompt.indexOf("## Collecting Contact Details");
  return prompt.slice(start, end);
}

describe("buildAgentPrompt — Intake Details section (T-100)", () => {
  it("lists the vertical's intake fields with their labels and select options", () => {
    const section = intakeSectionOf("dental");
    expect(section).toContain("New or returning patient (New patient / Returning patient)");
    expect(section).toContain("Insurance (yes/no)");
    expect(section).toContain("Insurance provider");
  });

  it("renders select options for hvac and property-management labels", () => {
    expect(intakeSectionOf("hvac")).toContain("System type (Central AC / Heat pump / Furnace / Mini-split / Not sure)");
    expect(intakeSectionOf("property-management")).toContain("Unit number");
    expect(intakeSectionOf("property-management")).toContain("Urgency (Routine / Urgent / Emergency)");
  });

  it("marks booking-only fields", () => {
    expect(intakeSectionOf("roofing")).toContain("Roof type");
    expect(intakeSectionOf("roofing")).toContain("Insurance claim (yes/no)");
    expect(intakeSectionOf("property-management")).toContain(
      "Permission to enter (yes/no) — when booking only"
    );
  });

  it("tells the agent to skip intake when the caller is in a hurry or it's an emergency", () => {
    const section = intakeSectionOf("roofing");
    expect(section).toMatch(/in a hurry/i);
    expect(section).toMatch(/emergency/i);
    expect(section).toMatch(/never required/i);
    expect(section).toMatch(/never stall/i);
  });

  it("instructs the agent to record answers as Label: value lines in notes", () => {
    const section = intakeSectionOf("dental");
    expect(section).toContain('"Label: value"');
    expect(section).toContain('"Insurance: yes"');
    expect(section).toContain("bookAppointment or createLead");
  });

  it("sits between the booking rules and Collecting Contact Details", () => {
    const prompt = buildAgentPrompt(config());
    expect(prompt.indexOf("## Intake Details")).toBeGreaterThan(prompt.indexOf("## Booking Rules"));
    expect(prompt.indexOf("## Intake Details")).toBeLessThan(prompt.indexOf("## Collecting Contact Details"));
  });

  it("fails open — an unknown industry gets no intake section", () => {
    expect(intakeSectionOf("not-a-vertical")).toBe("");
  });

  it("care-homes and daycares intake sections never mention health or identity data", () => {
    const forbidden = /diagnos|allerg|medicat|condition|symptom|health|presence|whereabout|birth|full name/i;
    expect(intakeSectionOf("care-homes")).not.toMatch(forbidden);
    expect(intakeSectionOf("daycares")).not.toMatch(forbidden);
    expect(intakeSectionOf("care-homes")).toContain("Community type of interest");
    expect(intakeSectionOf("care-homes")).toContain("Desired move-in date");
    expect(intakeSectionOf("daycares")).toContain("Child age range");
    expect(intakeSectionOf("daycares")).toContain("Desired start date");
  });

  it("every vertical template renders a non-empty intake section", () => {
    for (const template of Object.values(VERTICAL_TEMPLATES)) {
      expect(
        intakeSectionOf(template.verticalId).length,
        `${template.verticalId} should render an intake section`
      ).toBeGreaterThan(0);
    }
  });
});
