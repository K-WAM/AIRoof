import { expect, it } from "vitest";
import { keepSavedEin, maskAnswers, maskEin } from "../mask";
import { ONBOARDING_FORMS } from "../forms";
it("masks EIN on every client read without changing stored answers", () => {
  const answers = { ein: "12-3456789", legalName: "Example" };
  expect(maskAnswers(ONBOARDING_FORMS.texting, answers)).toEqual({ ein: "••-•••6789", legalName: "Example" });
  expect(answers.ein).toBe("12-3456789");
  expect(maskEin("bad")).toBe("");
  expect(keepSavedEin("••-•••6789", answers.ein)).toBe(answers.ein);
});
