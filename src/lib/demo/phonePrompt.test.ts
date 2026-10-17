import { describe, expect, it } from "vitest";
import { trialPhoneInitiation } from "./phonePrompt";
import { buildTrialPrompt } from "./trialPrompt";
import { trialConfig } from "./roofingTrial";
const trial = { businessId: "demo-trial-roofing-" + "a".repeat(32), companyName: "Entered Roofing", name: "", email: "entered@example.test", expiresAt: Date.now() + 60000 };
const config = trialConfig(trial, "unit-field-key");
describe("demo phone prompt (no code)", () => {
  it("answers with the waiting page's business name and never mentions a code", () => {
    const init = trialPhoneInitiation(config, trial, "+15555550111");
    expect(init.conversation_config_override.agent?.first_message).toContain("Entered Roofing");
    const prompt = init.conversation_config_override.agent?.prompt?.prompt || "";
    expect(prompt).toContain("private phone demo");
    expect(prompt).not.toMatch(/demo code|connectDemoSession/i);
  });
  it("asks the caller's name once when setup has none, and never collects carrier contact", () => {
    const prompt = buildTrialPrompt(config, trial, new Date(), "phone");
    expect(prompt).toContain("ask once for the caller's first and last name");
    expect(prompt).toContain("NEVER ask for a phone number");
    expect(prompt).toContain('"confirmationEmail":"entered@example.test"');
    expect(prompt).toContain("a ZIP only if they offer it");
    expect(prompt).not.toContain("seven-question");
  });
  it("keeps a setup name authoritative", () => {
    expect(buildTrialPrompt(config, { ...trial, name: "Entered Caller" }, new Date(), "browser")).toContain("NEVER ask for it again");
  });
});
