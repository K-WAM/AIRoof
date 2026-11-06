import { expect, it } from "vitest";
import { effectiveBillingPrefs } from "./customerPayments";

it("does not select an imported term over the existing invoice default", () => {
  expect(effectiveBillingPrefs({ billingPrefs: { dueDays: 15, importedTerms: [{ name: "Example term", dueDays: 30, discountRate: 2 }] } })).toMatchObject({ dueDays: 15, importedTerms: [{ name: "Example term", dueDays: 30 }] });
});
it("keeps invalid or unmapped source due days out of invoice choices", () => {
  expect(effectiveBillingPrefs({ billingPrefs: { importedTerms: [{ name: "Unknown", dueDays: null }, { name: "Outside supported range", dueDays: 999 }] } })).toMatchObject({ dueDays: 0, importedTerms: [] });
});
