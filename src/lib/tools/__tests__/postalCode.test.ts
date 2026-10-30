import { describe, expect, it } from "vitest";
import { addressHasPostalCode } from "../postalCode";

describe("addressHasPostalCode", () => {
  it("accepts a US ZIP or ZIP+4 after the street", () => {
    expect(addressHasPostalCode("317 West Lake Bend Drive, 32804")).toBe(true);
    expect(addressHasPostalCode("317 West Riverbend Drive, Sunrise, FL 33322")).toBe(true);
    expect(addressHasPostalCode("120 Palm Way, Boca Raton, FL 33432-1234")).toBe(true);
  });

  it("rejects an address with no ZIP (the 2026-10-30 bake-off failure)", () => {
    expect(addressHasPostalCode("120 Palm Way, Boca Raton")).toBe(false);
    expect(addressHasPostalCode("317 This Lane Drive")).toBe(false);
  });

  it("never mistakes a 5-digit house number or a phone number for a ZIP", () => {
    expect(addressHasPostalCode("12345 Palm Way, Boca Raton")).toBe(false);
    expect(addressHasPostalCode("12 Palm Ave, call 5104537871")).toBe(false);
  });

  it("accepts a Canadian postal code and an explicit 'ZIP unknown' in either language", () => {
    expect(addressHasPostalCode("1055 W Georgia St, Vancouver, BC V6E 3P3")).toBe(true);
    expect(addressHasPostalCode("120 Palm Way, Boca Raton, ZIP unknown")).toBe(true);
    expect(addressHasPostalCode("120 Palm Way, sin código postal")).toBe(true);
  });
});
