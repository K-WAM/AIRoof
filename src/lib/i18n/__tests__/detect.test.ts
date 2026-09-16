import { describe, it, expect } from "vitest";
import { normalizeLang, detectLanguage } from "../detect";

describe("normalizeLang", () => {
  it("maps Whisper's full language names to ISO codes", () => {
    expect(normalizeLang("spanish")).toBe("es");
    expect(normalizeLang("Spanish")).toBe("es");
    expect(normalizeLang("english")).toBe("en");
  });
  it("passes an already-ISO code through unchanged", () => {
    expect(normalizeLang("es")).toBe("es");
  });
  it("passes any other detected language through uninterpreted", () => {
    expect(normalizeLang("portuguese")).toBe("portuguese");
  });
  it("returns undefined for empty/missing input", () => {
    expect(normalizeLang(undefined)).toBeUndefined();
    expect(normalizeLang(null)).toBeUndefined();
    expect(normalizeLang("")).toBeUndefined();
  });
});

describe("detectLanguage", () => {
  it("detects Spanish immediately from an accented character", () => {
    expect(detectLanguage("Puse doce bundles en el techo")).toBe("es");
  });
  it("detects Spanish from ñ or inverted punctuation with no other signal", () => {
    expect(detectLanguage("mañana vamos")).toBe("es");
    expect(detectLanguage("¿Cuanto cuesta?")).toBe("es");
  });
  it("detects Spanish from stopwords even with zero accented characters", () => {
    expect(detectLanguage("trabajamos con el cliente hoy")).toBe("es");
  });
  it("does not flag plain English as Spanish", () => {
    expect(detectLanguage("We put twelve bundles of shingles on the roof today")).toBeUndefined();
  });
  it("does not flag a single incidental stopword-shaped word as Spanish", () => {
    expect(detectLanguage("es un problema is not enough")).toBe("es"); // two hits: "es", "un"
    expect(detectLanguage("a lot of se here")).toBeUndefined(); // "se" alone — one hit, ambiguous
  });
  it("returns undefined for empty text", () => {
    expect(detectLanguage("")).toBeUndefined();
  });
});
