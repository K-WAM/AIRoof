import { describe, expect, it } from "vitest";
import { draftQuoteIntro } from "./draftQuoteIntro";
import { validNarrative } from "@/lib/documents/validation";

const f = (problem: string, includeInQuote = true, labor?: string) => ({
  problem, solution: "Do the work.", includeInQuote,
  ...(labor ? { lines: [{ description: labor, quantity: 1, unitPrice: 10, kind: "labor" as const }] } : {}),
});

describe("draftQuoteIntro", () => {
  it("returns an empty string when there is nothing to describe", () => {
    expect(draftQuoteIntro({ address: "1 Main" }, [])).toBe("");
    expect(draftQuoteIntro({ address: "1 Main" }, [f("Cracked tile", false)])).toBe("");
    expect(draftQuoteIntro({ address: "1 Main" }, [f("   ")])).toBe("");
  });

  it("lists only findings marked for the quote as short bullets, with the address", () => {
    const text = draftQuoteIntro({ address: "1420 Palm Way, Fort Lauderdale" }, [
      f("Six cracked tiles on the south slope.", true, "Tile replacement"), f("Split pipe boot", true, "Pipe collar replacement"), f("Internal-only note", false, "Secret work"),
    ]);
    expect(text).toBe("Thank you for reaching out to us. As requested, we visited 1420 Palm Way, Fort Lauderdale and recommend the following work:\n• Tile replacement\n• Pipe collar replacement");
    expect(text).not.toContain("Secret");
  });

  it("omits the address phrase when there is none, and is deterministic", () => {
    const a = draftQuoteIntro({}, [f("Cracked tile", true, "Tile replacement")]);
    expect(a).toBe("Thank you for reaching out to us. As requested, we visited your property and recommend the following work:\n• Tile replacement");
    expect(draftQuoteIntro({}, [f("Cracked tile", true, "Tile replacement")])).toBe(a);
  });

  it("thanks the business by name when it has one", () => {
    expect(draftQuoteIntro({ address: "1 Main" }, [f("Cracked tile", true, "Tile replacement")], "Roofdoctor South Florida"))
      .toBe("Thank you for reaching out to Roofdoctor South Florida. As requested, we visited 1 Main and recommend the following work:\n• Tile replacement");
  });

  it("never exceeds the narrative limit, however many findings there are", () => {
    const many = Array.from({ length: 60 }, (_, i) => f("p", true, `Long distinct piece of work number ${i} ${"x".repeat(40)}`));
    const text = draftQuoteIntro({ address: "1 Main" }, many);
    expect(text.length).toBeLessThanOrEqual(3800);
    expect(validNarrative(text)).toBe(true);
  });
});
