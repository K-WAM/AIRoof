import { describe, expect, it } from "vitest";
import { phoneDemoInitiation } from "./phonePrompt";
import { buildTrialPrompt } from "./trialPrompt";
import { trialConfig } from "./roofingTrial";
const trial = { businessId: "demo-trial-roofing-" + "a".repeat(32), companyName: "Entered Roofing", name: "Entered Caller", email: "entered@example.test", expiresAt: Date.now() + 60000 };
const config = trialConfig(trial, "unit-field-key");
describe("demo phone prompt states", () => {
  it("asks for the code once and preserves the ordinary no-code booking path", () => {
    const init = phoneDemoInitiation(config, "+15555550111");
    expect(init.conversation_config_override.agent?.first_message).toContain("eight digits");
    const prompt = init.conversation_config_override.agent?.prompt?.prompt || "";
    expect(prompt).toContain("preserving leading zeroes");
    expect(prompt).toContain("call connectDemoSession immediately");
    expect(prompt).toContain("simply starts a regular inspection request");
    expect(prompt).toContain("shared instructions below NO LONGER APPLY");
    expect(prompt).toContain("Never collect another email or promise SMS");
  });
  it("uses the verified setup after connecting without collecting carrier contact again", () => {
    const prompt = buildTrialPrompt(config, trial, new Date(), "phone");
    expect(prompt).toContain("private phone demo");
    expect(prompt).toContain("NEVER ask for a phone number");
    expect(prompt).toContain('"confirmationEmail":"entered@example.test"');
    expect(prompt).toContain("callbackPhone");
    expect(prompt).not.toContain("seven-question");
  });
});
