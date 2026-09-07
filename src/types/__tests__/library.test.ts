import { describe, expect, it } from "vitest";
import { lookupLaborRate, lookupUnitPrice } from "../library";
import type { LibraryLaborRate, LibraryMaterial } from "../library";

const materials: LibraryMaterial[] = [
  { name: "Architectural shingles", unit: "sq", unitPrice: 120 },
  { name: "Ridge cap", unit: "piece", unitPrice: 8.5 },
];

const laborRates: LibraryLaborRate[] = [
  { role: "Foreman", rate: 85 },
  { role: "Laborer", rate: 45 },
];

describe("lookupUnitPrice", () => {
  it("matches an exact name (case/whitespace insensitive)", () => {
    expect(lookupUnitPrice(materials, "  Architectural Shingles  ")).toBe(120);
  });

  it("matches a substring either direction", () => {
    expect(lookupUnitPrice(materials, "shingles")).toBe(120);
    expect(lookupUnitPrice([{ name: "shingles", unit: "sq", unitPrice: 100 }], "3-tab shingles bundle")).toBe(100);
  });

  it("returns null for no confident match, never fabricating a price", () => {
    expect(lookupUnitPrice(materials, "gutters")).toBeNull();
  });

  it("returns null for an empty item name", () => {
    expect(lookupUnitPrice(materials, "")).toBeNull();
  });
});

describe("lookupLaborRate", () => {
  it("matches an exact role (case/whitespace insensitive)", () => {
    expect(lookupLaborRate(laborRates, "  foreman  ")).toBe(85);
  });

  it("matches a substring either direction", () => {
    expect(lookupLaborRate(laborRates, "the foreman")).toBe(85);
  });

  it("returns null for a technician's name rather than a saved role — no guessing", () => {
    expect(lookupLaborRate(laborRates, "Mike")).toBeNull();
  });

  it("returns null for an empty description", () => {
    expect(lookupLaborRate(laborRates, "")).toBeNull();
  });
});
