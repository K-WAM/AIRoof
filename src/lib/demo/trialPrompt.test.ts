import { describe, expect, it } from "vitest";
import { buildTrialPrompt } from "./trialPrompt";
import { trialConfig } from "./roofingTrial";
const config = trialConfig({ businessId: "demo-trial-roofing-" + "a".repeat(32), companyName: "Synthetic Roofing", name: "Synthetic Caller", expiresAt: Date.now() + 60000 }, "test-key");
describe("private browser intake", () => {
  it("does not import the conflicting general phone checklist", () => {
    const prompt = buildTrialPrompt(config, { name: "Synthetic Caller", email: null }, new Date("2026-10-15T02:00:00Z"));
    expect(prompt).not.toContain("still ask 5, 6 and 7");
    expect(prompt).not.toContain("What's the best email");
    expect(prompt).toContain("NEVER ask for a phone number");
    expect(prompt).toContain("confirmationEmail is null, skip email completely");
    expect(prompt).toContain("October 14, 2026");
  });
  it("carries setup contact data and exact-time tool safeguards together", () => {
    const prompt = buildTrialPrompt(config, { name: "Synthetic Caller", email: "synthetic@example.test" });
    expect(prompt).toContain('"callerName":"Synthetic Caller","confirmationEmail":"synthetic@example.test"');
    expect(prompt).toContain("call bookAppointment immediately");
    expect(prompt).toContain("Never book a different time without the visitor agreeing");
    expect(prompt).toContain("A NOT BOOKED/error result is a failure");
  });
});
