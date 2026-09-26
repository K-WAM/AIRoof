import { describe, expect, it } from "vitest";
import { fmtPhone } from "./phone";

describe("fmtPhone", () => {
  it("formats US numbers in any shape", () => {
    expect(fmtPhone("+13055550111")).toBe("(305) 555-0111");
    expect(fmtPhone("305.555.0111")).toBe("(305) 555-0111");
    expect(fmtPhone("1-305-555-0111")).toBe("(305) 555-0111");
    expect(fmtPhone("+1 (825) 488-7791")).toBe("(825) 488-7791");
  });

  it("leaves anything it can't read as a US number untouched", () => {
    expect(fmtPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(fmtPhone("555-0199")).toBe("555-0199");
    expect(fmtPhone("305-555-0111 ext 12")).toBe("305-555-0111 ext 12");
    expect(fmtPhone(undefined)).toBe("");
    expect(fmtPhone(null)).toBe("");
  });
});
