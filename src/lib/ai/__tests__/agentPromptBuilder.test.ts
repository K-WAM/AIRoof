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

// REGRESSIONS (owner's demo call, 2026-09-25): "a tiny drip, it's not raining" was escalated as an emergency, and the
// agent confirmed only two digits of the caller's number, then refused to read the full number back "for privacy".
describe("buildAgentPrompt — escalation and phone read-back", () => {
  it("escalates on what is happening now, not on the word leak, and never exposes the escalation phone", () => {
    const prompt = buildAgentPrompt(config({ escalationEnabled: true, escalationPhone: "+13055550000", emergencyRules: VERTICAL_TEMPLATES.roofing.emergencyRules }));
    expect(prompt).toContain("Escalate ONLY when what the caller describes matches one of your Emergency Rules RIGHT NOW");
    expect(prompt).toContain("small drip");
    expect(prompt).toContain("take a message with createLead");
    expect(prompt).not.toContain("+13055550000");
    expect(VERTICAL_TEMPLATES.roofing.emergencyRules.some((rule) => /leak, or flooding: escalate immediately/.test(rule))).toBe(false);
  });

  it("books urgent problems into the soonest opening when escalation is off (roofing default, 2026-09-28 Carla call)", () => {
    const prompt = buildAgentPrompt(config({ emergencyRules: VERTICAL_TEMPLATES.roofing.emergencyRules }));
    expect(prompt).toContain("## Urgent Problems (book them — never escalate)");
    expect(prompt).toContain("Never use escalateCall for this business");
    expect(prompt).toContain("\"URGENT: \"");
    expect(prompt).toContain("call 911 first — then keep helping them book");
    expect(prompt).toContain("Wherever a rule above says \"escalate\"");
    expect(prompt).not.toContain("## Escalation\n");
    expect(prompt).not.toContain("call escalateCall. The team sees it");
  });

  it("keeps escalation on by default for the care family (a missing child is not a booking)", () => {
    const prompt = buildAgentPrompt(config({ industry: "daycares" }));
    expect(prompt).toContain("## Escalation");
    expect(prompt).not.toContain("Never use escalateCall");
    expect(buildAgentPrompt(config({ industry: "daycares", escalationEnabled: false }))).toContain("Never use escalateCall");
  });

  it("confirms all four last digits and reads the whole number back when asked", () => {
    const prompt = buildAgentPrompt(config(), { runtime: { callerPhone: "+18254887791" } });
    expect(prompt).toContain("ending in 7-7-9-1");
    expect(prompt).toContain("If the caller asks to hear the whole number, read all of it back");
  });
});

describe("buildAgentPrompt — moving an appointment", () => {
  it("checks the new time before cancelling and never leaves the caller with nothing", () => {
    const prompt = buildAgentPrompt(config());
    expect(prompt).toContain("To move an appointment to a new time");
    expect(prompt.indexOf("call checkAvailability for that time first")).toBeLessThan(prompt.indexOf("call cancelAppointment and then bookAppointment"));
    expect(prompt).toContain("never leave them with no appointment and no follow-up");
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
    expect(prompt).toContain("preferredDate and preferredTime");
    expect(prompt).toContain("bookAppointment for exactly that time");
    expect(prompt).toContain("never ask the caller to pick blindly");
    // 2026-09-27 call: asked "anything in the afternoon?", the model named 1 PM and 2 PM open and 3 PM taken with no tool call.
    expect(prompt).toContain("Every time the caller asks about a different day, time or part of the day");
    expect(prompt).toContain("Never say a time is open or taken unless a tool returned that exact time during this call");
    expect(prompt).toContain("What's the best email for your confirmation?");
    // 2026-09-28: the address is the bill-to address, so the AI asks for a missing ZIP code.
    expect(prompt).toContain("When the caller gives an address with no ZIP code, your very next question is");
    expect(prompt).toContain("Only AFTER bookAppointment succeeds");
    expect(prompt).toContain("Never tell the caller you checked, booked or cancelled anything unless you actually called that tool");
    expect(prompt).toContain("do not pretend it worked");
    expect(prompt).not.toContain("say \"One moment while I check the calendar.\"");
  });

  it("asks access, email and OK-to-text before booking, then saves late details and never closes early (plan §1 C/D/E)", () => {
    const prompt = buildAgentPrompt(config());
    expect(prompt.indexOf("## Booking Checklist")).toBeGreaterThan(-1);
    expect(prompt).toContain("a gate code, pets, parking?");
    expect(prompt).toContain("\"Access: …\"");
    expect(prompt).toContain("Is it OK to text you about this appointment at this number?");
    expect(prompt).toContain("still ask 5, 6 and 7 before you book");
    expect(prompt).toContain("save each one with addBookingNote");
    expect(prompt).toContain("Do NOT end an answer with \"Is there anything else I can help you with?\"");
    expect(prompt).toContain("end the call (end_call)");
    expect(prompt).not.toContain("the office will confirm first thing");
  });

  it("saves the caller's name without a leading 'it's' / 'es' (\"Es Carla Esnaida\")", () => {
    expect(buildAgentPrompt(config())).toContain("\"Es Carla Esnaida\" is \"Carla Esnaida\"");
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
