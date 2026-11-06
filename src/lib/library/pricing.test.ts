import { expect, it } from "vitest";
import { normalizePricing } from "./pricing";

it("fills every missing list so the Library screen never reads undefined", () => {
  expect(normalizePricing({ materials: [{ name: "Shingle", unit: "each", unitPrice: 10 }] } as never)).toMatchObject({ materials: [{ name: "Shingle" }], laborRates: [], documents: [] });
  expect(normalizePricing(undefined)).toEqual({ materials: [], laborRates: [], documents: [] });
  expect(normalizePricing({ materials: "bad", laborRates: null, defaultTaxRate: 7 } as never)).toEqual({ materials: [], laborRates: [], documents: [], defaultTaxRate: 7 });
});
