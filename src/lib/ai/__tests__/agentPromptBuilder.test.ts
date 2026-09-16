import { describe, it, expect } from "vitest";
import { buildAgentPrompt } from "../agentPromptBuilder";
import type { BusinessConfig } from "@/types";

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
