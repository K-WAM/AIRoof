import { expect, it } from "vitest";
import { formDefinition } from "../presentation";
import { ONBOARDING_FORMS } from "../forms";
it("explains the per-company fee as plain text without changing the definition", () => {
  expect(JSON.stringify(formDefinition(ONBOARDING_FORMS.payments, 1250))).toContain("$1,250 per company");
  expect(JSON.stringify(formDefinition(ONBOARDING_FORMS.payments, 0))).toContain("$0 per company");
  expect(JSON.stringify(formDefinition(ONBOARDING_FORMS.payments))).toContain("confirmed with you before anything starts");
  expect(JSON.stringify(ONBOARDING_FORMS.payments)).toContain("{{setupFee}}");
});
it("the payments form collects no bank, card or tax numbers", () => {
  const fields = ONBOARDING_FORMS.payments.sections.flatMap(s => s.fields);
  expect(fields.some(f => /ein|ssn|routing|bank|cardnumber/i.test(f.id))).toBe(false);
  expect(ONBOARDING_FORMS.payments.dataUse.join(" ")).toContain("Stripe collects those on its own secure website");
});
