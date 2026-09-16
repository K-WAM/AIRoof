import { describe, it, expect } from "vitest";
import { totalLogoBytes, logoDataUri, logoStyle, needsLogoChip, pickDefaultLogo, MAX_LOGO_B64_BYTES, MAX_LOGOS } from "../logo";
import type { LibraryLogo } from "@/types/library";

function logo(overrides: Partial<LibraryLogo> = {}): LibraryLogo {
  return {
    logoId: "logo_1", name: "Mark", b64: "abc", mimeType: "image/png",
    variant: "color", createdAt: Date.now(), ...overrides,
  };
}

describe("totalLogoBytes", () => {
  it("sums the base64 lengths across every logo", () => {
    expect(totalLogoBytes([logo({ b64: "aaaa" }), logo({ b64: "bb" })])).toBe(6);
  });
  it("is 0 for an empty library", () => {
    expect(totalLogoBytes([])).toBe(0);
  });
});

describe("logoDataUri", () => {
  it("builds an <img>-ready data URI from the bare base64 + mimeType", () => {
    expect(logoDataUri({ b64: "Zm9v", mimeType: "image/svg+xml" })).toBe("data:image/svg+xml;base64,Zm9v");
  });
});

describe("logoStyle — the rendering rule that matters most", () => {
  it("never filters anything on a light (white document) surface, regardless of variant", () => {
    expect(logoStyle(logo({ variant: "color" }), "light")).toEqual({});
    expect(logoStyle(logo({ variant: "mono-dark" }), "light")).toEqual({});
    expect(logoStyle(logo({ variant: "mono-light" }), "light")).toEqual({});
  });

  it("knocks a mono-dark logo out to white on a colored brand bar", () => {
    expect(logoStyle(logo({ variant: "mono-dark" }), "brand-bar")).toEqual({ filter: "brightness(0) invert(1)" });
  });

  it("applies no filter to mono-light or color on a brand bar (color gets a chip instead — see needsLogoChip)", () => {
    expect(logoStyle(logo({ variant: "mono-light" }), "brand-bar")).toEqual({});
    expect(logoStyle(logo({ variant: "color" }), "brand-bar")).toEqual({});
  });
});

describe("needsLogoChip", () => {
  it("is true only for a full-color logo on a brand bar", () => {
    expect(needsLogoChip(logo({ variant: "color" }), "brand-bar")).toBe(true);
  });
  it("is false for every other combination", () => {
    expect(needsLogoChip(logo({ variant: "mono-dark" }), "brand-bar")).toBe(false);
    expect(needsLogoChip(logo({ variant: "mono-light" }), "brand-bar")).toBe(false);
    expect(needsLogoChip(logo({ variant: "color" }), "light")).toBe(false);
  });
});

describe("pickDefaultLogo", () => {
  it("returns the logo flagged isDefault", () => {
    const a = logo({ logoId: "a" });
    const b = logo({ logoId: "b", isDefault: true });
    expect(pickDefaultLogo([a, b])?.logoId).toBe("b");
  });
  it("falls back to the first logo when none is flagged default", () => {
    const a = logo({ logoId: "a" });
    const b = logo({ logoId: "b" });
    expect(pickDefaultLogo([a, b])?.logoId).toBe("a");
  });
  it("returns null for an empty library", () => {
    expect(pickDefaultLogo([])).toBeNull();
  });
});

describe("caps", () => {
  it("keeps the documented 5 x 180KB shape (900KB, under Firestore's 1MiB doc cap)", () => {
    expect(MAX_LOGOS).toBe(5);
    expect(MAX_LOGO_B64_BYTES).toBe(180_000);
    expect(MAX_LOGO_B64_BYTES * MAX_LOGOS).toBeLessThan(1_048_576);
  });
});
