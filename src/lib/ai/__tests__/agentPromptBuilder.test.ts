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

describe("buildAgentPrompt — How you speak", () => {
  it("keeps internal IDs silent and names the configured contact", () => {
    const prompt = buildAgentPrompt(config({ contactName: "Alex", agentLanguages: ["en", "es"] }));
    expect(prompt).toContain("## How you speak");
    expect(prompt).toContain("Never read internal IDs");
    expect(prompt).toContain("sayToCaller");
    expect(prompt).toContain("Alex or someone from the team will follow up");
    expect(prompt).toContain("continue in Spanish");
    expect(prompt).not.toContain("you'll receive an email");
  });

  // REGRESSION (owner's live demo call, 2026-09-25): a rule telling the model to SAY "One moment while I check the
  // calendar" before the tools made gpt-4o-mini say the line and then never call anything — it narrated a whole booking
  // (`tool_calls: []` on every turn) and nothing was saved. The pre-tool filler is now the platform's job
  // (pre_tool_speech: force); the prompt must instead make the tools mandatory and forbid claiming success without one.
  it("makes the tools mandatory and never scripts a filler phrase in their place", () => {
    const prompt = buildAgentPrompt(config());
    expect(prompt).toContain("## Using your tools");
    expect(prompt).toMatch(/call checkAvailability/);
    expect(prompt).toMatch(/call bookAppointment/);
    expect(prompt).toContain("Only AFTER it returns");
    expect(prompt).toContain("Never tell the caller you checked, booked or cancelled anything unless you actually called that tool");
    expect(prompt).toContain("do not pretend it worked");
    expect(prompt).not.toContain("say \"One moment while I check the calendar.\"");
  });

  it("puts the tool rules before the speaking style so they are not lost at the bottom", () => {
    const prompt = buildAgentPrompt(config());
    expect(prompt.indexOf("## Using your tools")).toBeLessThan(prompt.indexOf("## How you speak"));
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

// T-102 — call-recording disclosure. The prompt always instructs the agent to
// answer honestly (calls are recorded either way); when the spoken notice is
// enabled it also notes the greeting already told the caller.
describe("buildAgentPrompt — Call Recording section (T-102)", () => {
  it("includes the section by default (missing recordingDisclosure = default on)", () => {
    const prompt = buildAgentPrompt(config());
    expect(prompt).toContain("## Call Recording");
    expect(prompt).toContain("Calls may be recorded and transcribed.");
    expect(prompt).toContain("answer honestly");
    expect(prompt).toContain("The greeting already tells the caller this.");
  });

  it("notes the spoken notice is on when explicitly enabled", () => {
    const prompt = buildAgentPrompt(
      config({ recordingDisclosure: { enabled: true, text: "Calls are recorded." } })
    );
    expect(prompt).toContain("The greeting already tells the caller this.");
  });

  it("still answers honestly when the spoken notice is disabled — never volunteers it", () => {
    const prompt = buildAgentPrompt(config({ recordingDisclosure: { enabled: false } }));
    expect(prompt).toContain("## Call Recording");
    expect(prompt).toContain("do NOT volunteer");
    expect(prompt).toContain("answer honestly");
    expect(prompt).not.toContain("The greeting already tells the caller this.");
  });

  it("sits between Your Role and Scope", () => {
    const prompt = buildAgentPrompt(config());
    expect(prompt.indexOf("## Call Recording")).toBeGreaterThan(prompt.indexOf("## Your Role"));
    expect(prompt.indexOf("## Call Recording")).toBeLessThan(prompt.indexOf("## Scope"));
  });
});
