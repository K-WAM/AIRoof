import { describe, expect, it } from "vitest";
import { cityState, displayPhone, matchesVendor } from "../search";
import type { Vendor } from "@/types/vendor";

const v: Vendor = { vendorId: "v", name: "GAF Materials", type: "Manufacturer", city: "Parsippany", state: "NJ", contactName: "José Ruiz", active: true, provenance: { origin: "client", source: "x", addedAt: 1 }, createdAt: 1, updatedAt: 1 };

describe("vendor search helpers", () => {
  it("matches name, type, city and contact, ignoring case and accents", () => {
    for (const q of ["gaf", "MANUFACT", "parsip", "jose", "gaf nj".replace("nj", "ruiz")]) expect(matchesVendor(v, q)).toBe(true);
    expect(matchesVendor(v, "atlas")).toBe(false);
    expect(matchesVendor(v, "  ")).toBe(true);
  });
  it("formats phones and places", () => {
    expect(displayPhone("+19735551212")).toBe("(973) 555-1212");
    expect(displayPhone("ext 5")).toBe("ext 5");
    expect(cityState(v)).toBe("Parsippany, NJ");
    expect(cityState({ state: "NJ" })).toBe("NJ");
  });
});
