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
      "voice",
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
});
