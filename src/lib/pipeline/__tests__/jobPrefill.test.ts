import { describe, it, expect } from "vitest";
import { buildJobPrefillUrl } from "@/lib/pipeline/jobPrefill";

describe("buildJobPrefillUrl", () => {
  it("carries the shared name/phone/address/service fields for an appointment", () => {
    const url = buildJobPrefillUrl({
      clientName: "Jane Doe",
      clientPhone: "+1 (305) 555-0142",
      address: "123 Main St",
      serviceType: "Roof inspection",
      appointmentId: "A-1001",
    });
    expect(url).toBe(
      "/company/jobs?clientName=Jane+Doe&clientPhone=%2B1+%28305%29+555-0142&address=123+Main+St&serviceType=Roof+inspection&appointmentId=A-1001#new"
    );
  });

  it("carries lead provenance (leadId) and notes without an appointmentId", () => {
    const url = buildJobPrefillUrl({
      clientName: "John Smith",
      clientPhone: "555-0199",
      address: "",
      serviceType: "Leak repair",
      notes: "Caller says water is coming through the ceiling.",
      leadId: "lead-42",
    });
    expect(url).toContain("clientName=John+Smith");
    expect(url).toContain("leadId=lead-42");
    expect(url).toContain("notes=Caller+says+water+is+coming+through+the+ceiling.");
    expect(url).not.toContain("appointmentId");
    expect(url.endsWith("#new")).toBe(true);
  });

  it("preserves superadmin ?preview= context", () => {
    const url = buildJobPrefillUrl({ clientName: "X", leadId: "lead-1", preview: "demo-roofing" });
    expect(url).toContain("preview=demo-roofing");
  });

  it("omits optional fields when absent (no dead params, no auto-open)", () => {
    const url = buildJobPrefillUrl({ clientName: "Solo Caller" });
    expect(url).not.toContain("notes");
    expect(url).not.toContain("leadId");
    expect(url).not.toContain("appointmentId");
    expect(url).not.toContain("preview");
    expect(url).toBe("/company/jobs?clientName=Solo+Caller&clientPhone=&address=&serviceType=#new");
  });

  it("escapes notes so free-text can never break the URL", () => {
    const url = buildJobPrefillUrl({ clientName: "A", notes: 'quote "marks" & ampersand & more', leadId: "l" });
    expect(url).toContain("quote+%22marks%22+%26+ampersand+%26+more");
  });
});
