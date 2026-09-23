import { describe, expect, it } from "vitest";
import { VERTICAL_TEMPLATES, type VerticalId } from "../templates";

// T-100 — structured per-industry intake fields. Three things are asserted
// here: (1) template completeness — every one of the 13 verticals declares
// intake fields (the Record<VerticalId, …> type makes tsc fail otherwise, and
// these tests re-assert it so a vertical can never ship an empty set);
// (2) field shape validity; (3) the care-homes/daycares hard rule: intake
// must stay front-office only — tour interest / age RANGE / desired start
// date — never health or identifying data.

const ALL_VERTICALS = Object.values(VERTICAL_TEMPLATES);

const FORBIDDEN_INTAKE_TERMS =
  /diagnos|allerg|medicat|condition|symptom|health|presence|whereabout|medication|illness|disability/i;

describe("T-100 intake fields — template completeness", () => {
  it("every vertical declares between 2 and 5 intake fields", () => {
    expect(Object.keys(VERTICAL_TEMPLATES)).toHaveLength(13);
    for (const template of ALL_VERTICALS) {
      expect(
        template.intakeFields.length,
        `${template.verticalId} must declare 2–5 intake fields`
      ).toBeGreaterThanOrEqual(2);
      expect(
        template.intakeFields.length,
        `${template.verticalId} must declare 2–5 intake fields`
      ).toBeLessThanOrEqual(5);
    }
  });

  it("every vertical has unique field keys and a valid shape", () => {
    for (const template of ALL_VERTICALS) {
      const keys = template.intakeFields.map((field) => field.key);
      expect(new Set(keys).size, `${template.verticalId} has duplicate keys`).toBe(keys.length);
      for (const field of template.intakeFields) {
        expect(field.key).toMatch(/^[a-z0-9-]+$/);
        expect(field.label.trim().length).toBeGreaterThan(0);
        expect(["text", "select", "yesno", "date"]).toContain(field.type);
        expect(["lead", "appointment", "both"]).toContain(field.appliesTo);
        if (field.type === "select") {
          expect(field.options?.length, `${template.verticalId}.${field.key} needs options`).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("no intake field can ever be required", () => {
    for (const template of ALL_VERTICALS) {
      for (const field of template.intakeFields) {
        expect(field.required ?? false).toBe(false);
      }
    }
  });
});

describe("T-100 intake fields — care-homes and daycares hard rule", () => {
  const restricted: VerticalId[] = ["care-homes", "daycares"];

  it("collects no resident/child health data — no diagnoses, allergies, medications, or conditions", () => {
    for (const id of restricted) {
      const template = VERTICAL_TEMPLATES[id];
      const allText = template.intakeFields
        .flatMap((field) => [field.label, ...(field.options ?? [])])
        .join(" ");
      expect(allText, `${id} intake must never ask about health`).not.toMatch(FORBIDDEN_INTAKE_TERMS);
    }
  });

  it("collects no identifying data — never names, birthdays, or 'is X there'", () => {
    for (const id of restricted) {
      const template = VERTICAL_TEMPLATES[id];
      const allText = template.intakeFields
        .flatMap((field) => [field.label, ...(field.options ?? [])])
        .join(" ");
      expect(allText, `${id} intake must never ask for identifying data`).not.toMatch(
        /full name|first name|birth|dob|who is|is \w+ there/i
      );
      // No free-text fields at all: the model can never dump a free-form
      // health/identity answer into structured intake for these verticals.
      expect(template.intakeFields.some((f) => f.type === "text")).toBe(false);
    }
  });

  it("stays within the allowed front-office set: care level, age RANGE, program, desired start date", () => {
    const careHomes = VERTICAL_TEMPLATES["care-homes"];
    expect(careHomes.intakeFields.map((f) => f.key).sort()).toEqual([
      "care-level",
      "desired-start-date",
      "room-preference",
    ]);
    const moveIn = careHomes.intakeFields.find((f) => f.key === "desired-start-date");
    expect(moveIn?.type).toBe("date");

    const daycares = VERTICAL_TEMPLATES.daycares;
    expect(daycares.intakeFields.map((f) => f.key).sort()).toEqual([
      "child-age-range",
      "desired-start-date",
      "program",
    ]);
    const ageRange = daycares.intakeFields.find((f) => f.key === "child-age-range");
    expect(ageRange?.type).toBe("select");
    // A range, not a specific age/DOB: options must be bracketed spans.
    expect(ageRange?.options?.length).toBeGreaterThanOrEqual(3);
    for (const option of ageRange?.options ?? []) {
      expect(option).toMatch(/[-–]|months|years/);
    }
    const startDate = daycares.intakeFields.find((f) => f.key === "desired-start-date");
    expect(startDate?.type).toBe("date");
  });

  it("their booking rules remain the only place contact data is collected — intake keys are contact-free", () => {
    for (const id of restricted) {
      const template = VERTICAL_TEMPLATES[id];
      expect(
        template.intakeFields.every((f) => !/phone|email|name/i.test(f.key)),
        `${id} intake keys must not collect contact data`
      ).toBe(true);
    }
  });
});

describe("T-100 intake fields — per-vertical spot checks", () => {
  it("dental asks new-vs-returning and insurance", () => {
    const keys = VERTICAL_TEMPLATES.dental.intakeFields.map((f) => f.key);
    expect(keys).toContain("patient-status");
    expect(keys).toContain("insurance");
    expect(VERTICAL_TEMPLATES.dental.intakeFields.find((f) => f.key === "insurance")?.type).toBe("yesno");
  });

  it("hvac asks system type and age", () => {
    const keys = VERTICAL_TEMPLATES.hvac.intakeFields.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(["system-type", "system-age", "issue"]));
  });

  it("property management asks unit number and urgency", () => {
    const keys = VERTICAL_TEMPLATES["property-management"].intakeFields.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(["unit-number", "urgency"]));
  });

  it("roofing asks roof type and insurance claim", () => {
    const keys = VERTICAL_TEMPLATES.roofing.intakeFields.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(["roof-type", "insurance-claim"]));
  });

  it("cleaning asks home size and frequency", () => {
    const keys = VERTICAL_TEMPLATES.cleaning.intakeFields.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(["home-size", "frequency", "pets"]));
  });
});
