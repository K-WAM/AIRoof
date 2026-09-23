import { describe, it, expect } from "vitest";
import { buildJobPrefillUrl, formatIntakeLines } from "@/lib/pipeline/jobPrefill";
import { VERTICAL_TEMPLATES } from "@/lib/verticals/templates";

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

// T-100 — structured intake is carried into the job's notes as "Label: value"
// lines using the vertical template's labels.
describe("formatIntakeLines", () => {
  const dentalFields = VERTICAL_TEMPLATES.dental.intakeFields;

  it("renders intake entries as Label: value lines in template order", () => {
    const lines = formatIntakeLines(
      { "patient-status": "New patient", insurance: "yes" },
      dentalFields
    );
    expect(lines).toEqual(["New or returning patient: New patient", "Insurance: yes"]);
  });

  it("skips empty values and falls back to the key for unknown keys", () => {
    const lines = formatIntakeLines(
      { insurance: "yes", "insurance-provider": "  ", "some-future-key": "value" },
      dentalFields
    );
    expect(lines).toEqual(["Insurance: yes", "some-future-key: value"]);
  });

  it("returns no lines for undefined intake or no fields", () => {
    expect(formatIntakeLines(undefined, dentalFields)).toEqual([]);
    expect(formatIntakeLines({ insurance: "yes" }, undefined)).toEqual(["insurance: yes"]);
  });
});

describe("buildJobPrefillUrl — intake into notes (T-100)", () => {
  const dentalFields = VERTICAL_TEMPLATES.dental.intakeFields;

  it("appends intake lines to the notes param when a lead has intake", () => {
    const url = buildJobPrefillUrl({
      clientName: "Jane",
      notes: "Wants a Saturday slot.",
      intake: { "patient-status": "New patient", insurance: "yes" },
      intakeFields: dentalFields,
      leadId: "lead-9",
    });
    expect(url).toContain(
      "notes=Wants+a+Saturday+slot.%0ANew+or+returning+patient%3A+New+patient%0AInsurance%3A+yes"
    );
  });

  it("sets the notes param from intake alone when there are no free-text notes", () => {
    const url = buildJobPrefillUrl({
      clientName: "Jane",
      intake: { insurance: "yes" },
      intakeFields: dentalFields,
      appointmentId: "A-2",
    });
    expect(url).toContain("notes=Insurance%3A+yes");
    expect(url).toContain("appointmentId=A-2");
  });

  it("omits the notes param entirely when neither notes nor intake exist", () => {
    const url = buildJobPrefillUrl({ clientName: "Solo", intake: {}, intakeFields: dentalFields });
    expect(url).not.toContain("notes");
  });
});
