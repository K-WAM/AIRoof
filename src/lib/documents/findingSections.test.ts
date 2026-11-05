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
