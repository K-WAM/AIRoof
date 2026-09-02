import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const onboardingSource = readFileSync(
  resolve(process.cwd(), "src/app/admin/onboarding/page.tsx"),
  "utf8",
);

describe("admin onboarding stepper", () => {
  it("renders one connected six-step form with a progress indicator", () => {
    expect(onboardingSource.match(/data-wizard-step=\{\d\}/g)).toHaveLength(6);
    expect(onboardingSource.match(/hidden=\{currentStep !==/g)).toHaveLength(6);
    expect(onboardingSource).toContain('role="progressbar"');
    expect(onboardingSource).toContain("Step {currentStep + 1} of {wizardSteps.length}");
    expect(onboardingSource).toContain("6. Launch Readiness");
  });

  it("retains every field in the existing onboarding POST contract", () => {
    // "voice" was deliberately retired (T-053, 2026-09-02): it was a dead field,
    // written by two mutually-inconsistent form controls across the onboarding/
    // config pages and read by nothing downstream (not Vapi, not agentPromptBuilder).
    const payloadFields = [
      "businessName",
      "businessId",
      "ownerEmail",
      "phoneNumber",
      "serviceArea",
      "timezone",
      "industry",
      "planTier",
      "agentName",
      "agentIdentity",
      "greeting",
      "afterHoursGreeting",
      "calendarProvider",
      "escalationPhone",
      "notificationEmail",
      "emergencyRules",
      "bookingRules",
      "vapiAssistantId",
      "vapiPhoneNumberId",
      "brandColor",
      "contactPhone",
      "logoUrl",
    ];

    for (const field of payloadFields) {
      expect(onboardingSource, field).toContain(`name="${field}"`);
    }
  });

  it("does not reintroduce the retired dead voice form field", () => {
    // Note: `preset.agentVoice` (the plan-tier comparison table, an unrelated
    // field on PlanPreset) legitimately still appears in this file — only the
    // form control and its POST payload key were retired.
    expect(onboardingSource).not.toContain('name="voice"');
    expect(onboardingSource).not.toContain('name="agentVoice"');
    expect(onboardingSource).not.toContain("formData.get(\"voice\")");
  });
});
