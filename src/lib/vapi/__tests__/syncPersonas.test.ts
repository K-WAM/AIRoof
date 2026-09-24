import { describe, expect, it } from "vitest";
import { planPersonaSync } from "../syncPersonas";
import { DEFAULT_RECORDING_DISCLOSURE_EN } from "@/lib/recordingDisclosure";
import type { BusinessConfig } from "@/types";

function biz(businessId: string, over: Partial<BusinessConfig> = {}) {
  return {
    businessId,
    config: {
      businessName: `Biz ${businessId}`,
      industry: "roofing",
      businessHours: { monday: "9-5" },
      approvedServices: ["Roof inspections"],
      approvedFaqs: [],
      emergencyRules: [],
      bookingRules: [],
      disallowedTopics: [],
      greeting: "Thanks for calling. How can I help?",
      vapiAssistantId: `asst-${businessId}`,
      ...over,
    } as BusinessConfig,
  };
}

describe("planPersonaSync", () => {
  it("composes the recording notice first into the greeting for a tenant that never set one (default ON)", () => {
    const { targets } = planPersonaSync([biz("a")]);
    expect(targets).toHaveLength(1);
    expect(targets[0].firstMessage).toBe(`${DEFAULT_RECORDING_DISCLOSURE_EN} Thanks for calling. How can I help?`);
    expect(targets[0].disclosureEnabled).toBe(true);
    expect(targets[0].systemPrompt.length).toBeGreaterThan(100);
  });

  it("leaves the greeting untouched when the tenant turned the notice off", () => {
    const { targets } = planPersonaSync([biz("a", { recordingDisclosure: { enabled: false } })]);
    expect(targets[0].firstMessage).toBe("Thanks for calling. How can I help?");
    expect(targets[0].disclosureEnabled).toBe(false);
  });

  it("only sets the transcriber language when the tenant has one explicitly", () => {
    const { targets } = planPersonaSync([biz("a"), biz("b", { agentLanguage: "es" })]);
    expect(targets[0]).not.toHaveProperty("transcriberLanguage");
    expect(targets[1].transcriberLanguage).toBe("es");
    expect(targets[1].voiceConfig.agentLanguage).toBe("es");
  });

  it("skips tenants with no assistant or no greeting (never pushes a notice-only greeting)", () => {
    const plan = planPersonaSync([
      biz("noasst", { vapiAssistantId: undefined }),
      biz("nogreet", { greeting: "  " }),
      biz("ok"),
    ]);
    expect(plan.targets.map((t) => t.businessId)).toEqual(["ok"]);
    expect(plan.skipped.map((s) => [s.businessId, s.reason])).toEqual([
      ["noasst", "No Vapi assistant attached"],
      ["nogreet", "No greeting configured"],
    ]);
  });

  it("skips every tenant on a shared assistant instead of letting the last push win", () => {
    const plan = planPersonaSync([
      biz("demo1", { vapiAssistantId: "shared" }),
      biz("demo2", { vapiAssistantId: "shared" }),
      biz("solo"),
    ]);
    expect(plan.targets.map((t) => t.businessId)).toEqual(["solo"]);
    expect(plan.skipped.map((s) => s.businessId).sort()).toEqual(["demo1", "demo2"]);
    expect(plan.skipped[0].reason).toContain("shared by 2 tenants");
  });

  it("carries a configured voice override through so it is not reverted", () => {
    const voice = { en: { provider: "11labs" as const, voiceId: "warm_voice" } };
    const { targets } = planPersonaSync([biz("a", { voice })]);
    expect(targets[0].voiceConfig.voice).toEqual(voice);
  });

  it("skips a tenant whose config cannot build a prompt instead of aborting the whole sync", () => {
    const broken = biz("broken");
    (broken.config as unknown as Record<string, unknown>).approvedServices = null;
    const plan = planPersonaSync([broken, biz("ok")]);
    expect(plan.targets.map((t) => t.businessId)).toEqual(["ok"]);
    expect(plan.skipped[0].businessId).toBe("broken");
    expect(plan.skipped[0].reason).toContain("Prompt could not be built");
  });
});
