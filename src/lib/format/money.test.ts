import { describe, expect, it } from "vitest";
import { roundCents } from "./money";

describe("roundCents", () => {
  it("rounds half-cents up like a calculator, despite floating point", () => {
    expect(roundCents(99.99 * 1.5)).toBe(149.99);
    expect(roundCents(1.005)).toBe(1.01);
    expect(roundCents(0.125 * 3)).toBe(0.38);
    expect(roundCents(12.5)).toBe(12.5);
    expect(roundCents(-2.345)).toBe(-2.34);
    expect(roundCents(NaN)).toBe(0);
  });
});
