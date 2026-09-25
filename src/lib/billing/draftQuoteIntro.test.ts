import { describe, expect, it } from "vitest";
import { draftQuoteIntro } from "./draftQuoteIntro";
import { validNarrative } from "@/lib/documents/validation";

const f = (problem: string, includeInQuote = true) => ({ problem, includeInQuote });

describe("draftQuoteIntro", () => {
  it("returns an empty string when there is nothing to describe", () => {
    expect(draftQuoteIntro({ address: "1 Main" }, [])).toBe("");
    expect(draftQuoteIntro({ address: "1 Main" }, [f("Cracked tile", false)])).toBe("");
    expect(draftQuoteIntro({ address: "1 Main" }, [f("   ")])).toBe("");
  });

  it("lists only findings marked for the quote, with the address", () => {
    const text = draftQuoteIntro({ address: "1420 Palm Way, Fort Lauderdale" }, [
      f("Six cracked tiles on the south slope."), f("Split pipe boot"), f("Internal-only note", false),
    ]);
    expect(text).toContain("at 1420 Palm Way, Fort Lauderdale");
    expect(text).toContain("- Six cracked tiles on the south slope");
    expect(text).toContain("- Split pipe boot");
    expect(text).not.toContain("Internal-only");
  });

  it("omits the address phrase when there is none, and is deterministic", () => {
    const a = draftQuoteIntro({}, [f("Cracked tile")]);
    expect(a).not.toContain(" at ");
    expect(draftQuoteIntro({}, [f("Cracked tile")])).toBe(a);
  });

  it("never exceeds the narrative limit, however many findings there are", () => {
    const many = Array.from({ length: 60 }, (_, i) => f(`${"Long problem description ".repeat(30)}${i}`));
    const text = draftQuoteIntro({ address: "1 Main" }, many);
    expect(text.length).toBeLessThanOrEqual(3800);
    expect(validNarrative(text)).toBe(true);
  });
});
