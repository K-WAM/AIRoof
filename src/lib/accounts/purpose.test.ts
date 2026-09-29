import { describe, expect, it } from "vitest";
import { effectiveAccountPurpose } from "./purpose";

describe("effectiveAccountPurpose (contract C-A)", () => {
  it("the demo tenant is always demo, whatever is stored", () => {
    expect(effectiveAccountPurpose("demo-roofing", { accountPurpose: "client" })).toBe("demo");
    expect(effectiveAccountPurpose("other", { isDemo: true, accountPurpose: "client" })).toBe("demo");
  });
  it("a stored client/test/archived is kept; a stored 'demo' on a non-demo tenant is not trusted", () => {
    expect(effectiveAccountPurpose("acme", { accountPurpose: "client" })).toBe("client");
    expect(effectiveAccountPurpose("acme", { accountPurpose: "archived" })).toBe("archived");
    expect(effectiveAccountPurpose("acme", { accountPurpose: "demo" })).toBe("unclassified");
  });
  it("missing or unknown → unclassified (never guessed from the name)", () => {
    expect(effectiveAccountPurpose("carlita-elevenlabs-test", {})).toBe("unclassified");
    expect(effectiveAccountPurpose("acme", { accountPurpose: "vip" })).toBe("unclassified");
    expect(effectiveAccountPurpose("acme", undefined)).toBe("unclassified");
  });
});
