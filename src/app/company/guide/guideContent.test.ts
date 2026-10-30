import { describe, expect, it } from "vitest";
import { VERTICAL_TEMPLATES } from "@/lib/verticals/templates";
import type { CompanyModule } from "@/hooks/useBusinessModules";
import { GUIDE_ROLES, guideFor } from "./guideContent";

const all = () => true;
const roofing = { isEnabled: all, vocab: VERTICAL_TEMPLATES.roofing.vocab, calendarMode: "jobs" as const, quotes: true };

describe("guideFor", () => {
  it("keeps every role to one short page", () => {
    for (const role of GUIDE_ROLES) {
      const guide = guideFor(role, roofing);
      expect(guide.steps.length).toBeGreaterThanOrEqual(4);
      expect(guide.steps.length).toBeLessThanOrEqual(5);
      expect(guide.tips.length).toBeLessThanOrEqual(3);
    }
  });

  it("gives the foreman the voice-note flow in this industry's words", () => {
    const foreman = guideFor("foreman", roofing);
    expect(foreman.steps.map((step) => step.action)).toEqual(["Field", "Clock in", "Hold to talk, or tap to start", "+ Photo", "Clock out for the day"]);
    expect(foreman.steps[2].detail).toContain(VERTICAL_TEMPLATES.roofing.vocab.voiceExample);
  });

  it("never mentions jobs, crews or field notes to an industry without them", () => {
    const dental = { isEnabled: (m: CompanyModule) => m !== "jobs" && m !== "pricing", vocab: VERTICAL_TEMPLATES.dental.vocab, calendarMode: "appointments" as const, quotes: false };
    const staff = guideFor("staff", dental);
    expect(staff.title).toBe("Turn calls into confirmed bookings");
    expect(JSON.stringify(staff)).not.toMatch(/Create Job|Send to a worker|Findings/);
    expect(guideFor("admin", dental).steps.some((step) => step.path === "/company/library?section=crews")).toBe(false);
  });

  it("leaves Findings and Quote out for set-price work", () => {
    const petCare = { ...roofing, vocab: VERTICAL_TEMPLATES["pet-care"].vocab, quotes: false };
    const jobPage = guideFor("staff", petCare).steps.find((step) => step.path === "/company/jobs");
    expect(jobPage?.detail).toMatch(/^Report and Invoice/);
  });

  it("drops calls steps for a client without the phone product", () => {
    const owner = guideFor("owner", { ...roofing, isEnabled: (m: CompanyModule) => m !== "calls" });
    expect(owner.steps.map((step) => step.action)).not.toContain("Pipeline");
  });
});
