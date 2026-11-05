import { describe, it, expect } from "vitest";
import { amountInWords, DEFAULT_LETTERS, renderLetter, validLetterTemplate } from "./letters";

describe("letter text renderer", () => {
  it("omits unknown, empty and inherited fields and never interprets values", () => {
    const values = Object.assign(Object.create({ "customer.name": "inherited" }), { price: "<img onerror=alert(1)>{{date}}" });
    const result = renderLetter({ ...DEFAULT_LETTERS.proposal, title: "{{customer.name}}", sections: [{ id: "one", body: "{{unknown}} {{date}}\n- {{price}}" }] }, values, { includeOptional: [] });
    expect(result.missing).toEqual(["customer.name", "unknown", "date"]);
    expect(result.blocks[0].bullets).toEqual(["<img onerror=alert(1)>{{date}}"]);
  });
  it("includes optional sections only by id and parses headings and bullets", () => {
    const template = { ...DEFAULT_LETTERS.proposal, sections: [{ id: "one", heading: "{{business.name}}", body: "First\nSecond\n- One\n- Two", optional: true }] };
    expect(renderLetter(template, {}, { includeOptional: [] }).blocks).toEqual([]);
    expect(renderLetter(template, { "business.name": "Example" }, { includeOptional: ["one"] }).blocks[0]).toEqual({ heading: "Example", paragraphs: ["First", "Second"], bullets: ["One", "Two"] });
  });
  it("validates bounded template shapes", () => {
    expect(validLetterTemplate(DEFAULT_LETTERS.proposal)).toBe(true);
    for (const patch of [{ title: "x".repeat(121) }, { sections: [{ id: "x", body: "x".repeat(4001) }] }, { sections: Array(21).fill({ id: "x", body: "" }) }, { kind: "bad" }]) expect(validLetterTemplate({ ...DEFAULT_LETTERS.proposal, ...patch })).toBe(false);
  });
});
describe("amount in words", () => {
  it.each([[0, "Zero Dollars"], [2695, "Two Thousand Six Hundred Ninety-Five Dollars"], [2695.5, "Two Thousand Six Hundred Ninety-Five Dollars and 50/100"], [1_000_001.01, "One Million One Dollars and 01/100"], [9_999_999.99, "Nine Million Nine Hundred Ninety-Nine Thousand Nine Hundred Ninety-Nine Dollars and 99/100"]])("renders %s", (amount, expected) => expect(amountInWords(amount as number)).toBe(expected));
  it.each([-1, NaN, Infinity, 10_000_000.01])("refuses %s", amount => expect(() => amountInWords(amount)).toThrow());
});
