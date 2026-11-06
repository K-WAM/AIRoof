// @vitest-environment jsdom
import { createElement } from "react";
import { render } from "@testing-library/react";
import { DocumentPreview } from "./DocumentPreview";
import { resolveLetterhead } from "./letterhead";
import { expect, it } from "vitest";
import { findingSectionsBlock } from "./emailBlocks";
import { buildJobReportEmailHtml } from "@/lib/billing/jobReportEmailHtml";

const findings = [{ findingId: "f", category: "Entry <script>", problem: "Worn <surface>", solution: "Restore & finish", includeInReport: true, includeInQuote: true, addedAt: 1 }];
it("escapes category and finding text in email sections", () => {
  for (const output of [findingSectionsBlock(findings)]) {
    expect(output).toContain("Entry &lt;script&gt;");
    expect(output).toContain("Problem:");
    expect(output).toContain("Corrective Action:");
    expect(output).toContain("Restore &amp; finish");
    expect(output).not.toContain("<script>");
  }
});
it("report finding sections default on and can retain the previous layout", () => {
  const input = { business: {}, logos: [], jobId: "J-1", title: "Service", billTo: { name: "Customer" }, findings };
  expect(buildJobReportEmailHtml(input)).toContain("Corrective Action:");
  expect(buildJobReportEmailHtml({ ...input, reportDocument: { showFindingSections: false } })).not.toContain("Corrective Action:");
  expect(buildJobReportEmailHtml({ ...input, findings: [] })).not.toContain("Corrective Action:");
});


it("groups first-seen categories and keeps finding order without mutating input", async () => {
  const { groupFindingsByCategory } = await import("./findingGroups");
  const items = Object.freeze([
    Object.freeze({ category: "Leaks", problem: "A" }), Object.freeze({ category: "Flashing", problem: "B" }),
    Object.freeze({ category: " Leaks ", problem: "C" }), Object.freeze({ category: "Leaks", problem: "D" }),
    Object.freeze({ category: "  ", problem: "E" }), Object.freeze({ problem: "F" }),
  ]);
  const grouped = groupFindingsByCategory(items);
  expect(grouped.map(g => g.category)).toEqual(["Leaks", "Flashing", "Findings"]);
  expect(grouped.map(g => g.findings.map(f => f.problem))).toEqual([["A", "C", "D"], ["B"], ["E", "F"]]);
  expect(items.map(f => f.problem)).toEqual(["A", "B", "C", "D", "E", "F"]);
  expect(groupFindingsByCategory([])).toEqual([]);
});

it("prints one category and fifty numbered findings in email", () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ category: "Leaks", problem: `Leak ${i + 1}`, solution: `Repair ${i + 1}`, note: `Note ${i + 1}` }));
  const html = findingSectionsBlock(items);
  expect(html.match(/<h3>Leaks<\/h3>/g)).toHaveLength(1);
  expect(html.match(/<ol /g)).toHaveLength(1);
  expect(html.match(/class="document-finding"/g)).toHaveLength(50);
  expect(html.indexOf("Leak 1<")).toBeLessThan(html.indexOf("Leak 50<"));
  expect(findingSectionsBlock([])).toBe("");
});

for (const documentStyle of ["standard", "classic"] as const) for (const title of ["Report", "Quote", "Invoice"]) {
  it(`${documentStyle} ${title} groups categories once and retains every numbered finding and note`, async () => {
    const items = [
      { category: "Leaks", problem: "Leak A", solution: "Repair A", note: "Note A" },
      { category: "Flashing", problem: "Loose B", solution: "Secure B" },
      { category: "Leaks", problem: "Leak C", solution: "Repair C", note: "Note C" },
      { category: "Leaks", problem: "Leak D", solution: "Repair D" },
      { problem: "No category E", solution: "Repair E", note: "<img src=x onerror=1>" },
    ];
    const html = render(createElement(DocumentPreview, { title, brand: resolveLetterhead({ businessName: "Example", documentStyle }), meta: [], billTo: { name: "Customer" }, findings: items })).container.innerHTML;
    expect(Array.from(html.matchAll(/<h3[^>]*>(.*?)<\/h3>/g), match => match[1])).toEqual(["Leaks", "Flashing", "Findings"]);
    expect(html.match(/<ol /g)).toHaveLength(3);
    expect(html.match(/class="document-finding"/g)).toHaveLength(5);
    expect(html.indexOf("Leak A")).toBeLessThan(html.indexOf("Leak C"));
    expect(html.indexOf("Leak C")).toBeLessThan(html.indexOf("Leak D"));
    expect(html).toContain("Note A"); expect(html).toContain("Note C");
    expect(html).toContain("&lt;img src=x onerror=1&gt;"); expect(html).not.toContain("<img src=x");
    const compact = render(createElement(DocumentPreview, { title, brand: resolveLetterhead({ documentStyle }), meta: [], billTo: { name: "Customer" }, findings: items, findingSections: false })).container.innerHTML;
    expect(compact).not.toContain('class="document-finding-category"'); expect(compact).toContain("Leak D");
  });
}
