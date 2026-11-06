import { describe, expect, it } from "vitest";
import { addressLines, classicAccent, classicGroupTitle, classicKind, CLASSIC_DEFAULT_COLOR, displayWebsite, documentStyleOf } from "../documentStyle";
import { footerBlock, invoiceGroupsBlock, letterheadBlock, classicLetterTopBlock, emailAccent } from "../emailBlocks";
import { resolveLetterhead } from "../letterhead";

describe("documentStyle helpers", () => {
  it("is standard unless the business chose classic", () => {
    expect(documentStyleOf(undefined)).toBe("standard");
    expect(documentStyleOf({ documentStyle: "fancy" })).toBe("standard");
    expect(documentStyleOf({ documentStyle: "classic" })).toBe("classic");
  });

  it("splits a one-line address into street and city lines only when it has both", () => {
    expect(addressLines("11 Sample Way, Coral Springs, FL 33065")).toEqual(["11 Sample Way", "Coral Springs, FL 33065"]);
    expect(addressLines("Coral Springs, FL")).toEqual(["Coral Springs, FL"]);
    expect(addressLines("11 Sample Way\nCoral Springs, FL")).toEqual(["11 Sample Way", "Coral Springs, FL"]);
    expect(addressLines("  ")).toEqual([]);
  });

  it("prints a website without its protocol and calls the Other bucket services rendered", () => {
    expect(displayWebsite("https://www.example.test/")).toBe("www.example.test");
    expect(classicGroupTitle("Other")).toBe("Services Rendered");
    expect(classicGroupTitle("Labor")).toBe("Labor");
  });

  it("knows invoices, quotes, reports and notices by title", () => {
    expect(classicKind("Invoice")).toBe("invoice");
    expect(classicKind("Deposit invoice")).toBe("invoice");
    expect(classicKind("Quote")).toBe("quote");
    expect(classicKind("Report")).toBe("report");
    expect(classicKind("Inspection completion notice")).toBe("notice");
  });

  it("uses the brand colour, else a letterhead red", () => {
    expect(classicAccent("#123456")).toBe("#123456");
    expect(classicAccent("red")).toBe(CLASSIC_DEFAULT_COLOR);
    expect(emailAccent(resolveLetterhead({ documentStyle: "classic" }))).toBe(CLASSIC_DEFAULT_COLOR);
    expect(emailAccent(resolveLetterhead({}))).toBe("#0f766e");
  });
});

describe("classic email blocks", () => {
  const brand = resolveLetterhead({
    documentStyle: "classic", businessName: "Sample <Roofing>", address: "11 Sample Way, Coral Springs, FL 33065",
    contactPhone: "5550100", fax: "5550101", licenseNumber: "CCC-000", websiteUrl: "https://www.example.test", tagline: "Since <1985>",
  });

  it("prints the letterhead with escaped values, Invoice No., phone/fax and the state license", () => {
    const html = letterheadBlock(brand, "Invoice", [["Date", "Nov 6, 2026"], ["Number", "INV-1"], ["Description", "<b>Leak</b>"]]);
    expect(html).toContain("Sample &lt;Roofing&gt;");
    expect(html).not.toContain("<Roofing>");
    expect(html).toContain("Invoice No.:");
    expect(html).toContain("&lt;b&gt;Leak&lt;/b&gt;");
    expect(html).toContain("Fax:");
    expect(html).toContain("STATE LICENSE #CCC-000");
    expect(html).toContain("11 SAMPLE WAY");
  });

  it("ends with the license on the left and the website on the right", () => {
    const html = footerBlock(brand);
    expect(html).toContain("LIC# CCC-000");
    expect(html).toContain("www.example.test");
    expect(html).not.toContain("https://");
  });

  it("puts every group in one boxed table with a subtotal under each", () => {
    const html = invoiceGroupsBlock([
      { title: "Labor", rows: [{ item: "Labor", description: "Water test", quantity: 5.5, unitPrice: 93.5, amount: 514.25 }], subtotal: 514.25 },
      { title: "Other", rows: [{ item: "Other", description: "Final billing", quantity: 1, unitPrice: 2795, amount: 2795 }], subtotal: 2795 },
    ], true);
    expect(html).toContain(">Item<");
    expect(html).toContain("5.50");
    expect(html).toContain("Services Rendered");
    expect((html.match(/Subtotal/g) ?? []).length).toBe(2);
  });

  it("escapes the slogan and company line on the letter's top band", () => {
    const html = classicLetterTopBlock(brand);
    expect(html).toContain("Since &lt;1985&gt;");
    expect(html).toContain("Sample &lt;Roofing&gt;");
    expect(html).not.toContain("<Roofing>");
  });

  it("leaves the standard look untouched", () => {
    const standard = resolveLetterhead({ businessName: "Plain Co", licenseNumber: "L-1" });
    expect(letterheadBlock(standard, "Invoice", [["Number", "INV-1"]])).toContain("License #L-1");
    expect(footerBlock(standard)).toContain("Plain Co");
  });
});
