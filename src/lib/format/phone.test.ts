import { describe, expect, it } from "vitest";
import { contactPhone, fmtPhone, samePhone } from "./phone";

describe("samePhone / contactPhone", () => {
  it("matches one line written two ways, never a placeholder", () => {
    expect(samePhone("+19548829586", "954-882-9586")).toBe(true);
    expect(samePhone("+19548829586", "305-389-4611")).toBe(false);
    expect(samePhone("caller ID", "caller ID")).toBe(false);
  });

  it("prefers the number the caller said over caller ID", () => {
    expect(contactPhone({ callerPhone: "+19548829586", callbackPhone: "305-389-4611" })).toBe("305-389-4611");
    expect(contactPhone({ callerPhone: "+19548829586" })).toBe("+19548829586");
    expect(contactPhone({ callerPhone: "+19548829586", callbackPhone: "unknown" })).toBe("+19548829586");
    expect(contactPhone({})).toBeUndefined();
  });
});

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
