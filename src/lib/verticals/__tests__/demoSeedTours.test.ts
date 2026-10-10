import { describe, expect, it } from "vitest";
import { VERTICAL_TEMPLATES, type VerticalId } from "../templates";
import { demoSeedFor } from "../demoSeed";
import { TOUR_INTAKE, isTourVertical, tailorTourSeed } from "../demoSeedTours";

const NOW = Date.UTC(2026, 9, 10, 15);
const VERTICAL_IDS = Object.keys(VERTICAL_TEMPLATES) as VerticalId[];

describe("tour-industry demo seed (care homes, daycares)", () => {
  it("leaves roofing and every non-tour industry's seed exactly as built", () => {
    for (const id of VERTICAL_IDS.filter((v) => !isTourVertical(v))) {
      const seed = demoSeedFor(id, NOW);
      expect(tailorTourSeed(id, seed), id).toBe(seed);
      expect(seed.leads.some((l) => l.intake) || seed.appointments.some((a) => a.intake), id).toBe(false);
    }
  });

  it("only shows intake answers the AI could really have captured", () => {
    for (const id of ["care-homes", "daycares"] as const) {
      const fields = VERTICAL_TEMPLATES[id].intakeFields;
      for (const answers of TOUR_INTAKE[id]) {
        for (const [key, value] of Object.entries(answers)) {
          const field = fields.find((f) => f.key === key);
          expect(field, `${id}:${key}`).toBeDefined();
          if (field!.type === "select") expect(field!.options, `${id}:${key}`).toContain(value);
        }
      }
      const seed = demoSeedFor(id, NOW);
      expect(seed.leads.every((l) => l.intake), id).toBe(true);
      expect(seed.appointments.every((a) => a.intake), id).toBe(true);
    }
  });

  it("speaks like an admissions desk, not a field crew, and demos the privacy refusal", () => {
    for (const id of ["care-homes", "daycares"] as const) {
      const seed = demoSeedFor(id, NOW);
      const transcript = seed.calls.flatMap((c) => c.messages.map((m) => m.text)).join(" ");
      expect(transcript, id).not.toMatch(/service address|send someone|get a price/i);
      expect(transcript, id).toMatch(/can't (share|confirm)/i);
      // Every scripted call opens with this industry's own agent.
      for (const call of seed.calls) expect(call.messages[0].text, `${id}:${call.callId}`).toMatch(new RegExp(VERTICAL_TEMPLATES[id].agentName));
    }
  });
});
