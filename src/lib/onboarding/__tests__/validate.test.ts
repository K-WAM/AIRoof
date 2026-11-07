import { describe, expect, it } from "vitest";
import type { OnboardingField, OnboardingFormDefinition } from "@/types/onboarding";
import { ONBOARDING_FORMS } from "../forms";
import { fieldVisible, initialAnswers, validateAnswers } from "../validate";

function definition(field: OnboardingField): OnboardingFormDefinition { return { ...ONBOARDING_FORMS.company, sections: [{ id: "test", title: "Test", fields: [field] }] }; }
function check(field: OnboardingField, value: unknown, mode: "draft" | "submit" = "draft", prefill = {}) { return validateAnswers(definition(field), { [field.id]: value, submittedBy: "Test Owner" }, mode, prefill); }
describe("onboarding validation", () => {
  it("refuses missing required fields on submit, but permits incomplete drafts", () => {
    const f: OnboardingField = { id: "name", type: "text", label: "Name", required: true, max: 5 };
    expect(check(f, "", "submit").errors.name).toBe("Enter name.");
    expect(check(f, "", "draft").valid).toBe(true);
    expect(check(f, "too long").valid).toBe(false);
    expect(validateAnswers(definition(f), { name: "ok", businessId: "other" }, "draft").valid).toBe(false);
  });
  it.each([
    ["email", "bad email"], ["tel", "12"], ["ein", "1234"], ["url", "javascript:alert(1)"], ["url", "http://example.test"], ["url", "https://user:pass@example.test"], ["number", -1], ["number", Infinity], ["number", "12"], ["money", 1.5], ["checkbox", "true"], ["text", {}], ["textarea", 2],
  ] as const)("rejects invalid %s values", (type, value) => { expect(check({ id: "test", type, label: "Test" }, value).valid).toBe(false); });
  it("normalizes EIN, US phones and secure URLs", () => {
    expect(check({ id: "ein", type: "ein", label: "EIN" }, "123456789").answers.ein).toBe("12-3456789");
    expect(check({ id: "tel", type: "tel", label: "Phone" }, "(954) 555-0123").answers.tel).toBe("+19545550123");
    expect(check({ id: "url", type: "url", label: "Website" }, "example.test").answers.url).toBe("https://example.test/");
    expect(check({ id: "amount", type: "money", label: "Amount" }, 0).valid).toBe(true);
  });
  it("retains only an exact mask of the previously saved EIN", () => {
    const def = definition({ id: "ein", type: "ein", label: "EIN" });
    const saved = { ein: "12-3456789" };
    expect(validateAnswers(def, { ein: "••-•••6789" }, "draft", {}, saved).answers.ein).toBe(saved.ein);
    expect(validateAnswers(def, { ein: "••-•••9999" }, "draft", {}, saved).valid).toBe(false);
    expect(validateAnswers(def, { ein: "••-•••6789" }, "draft").valid).toBe(false);
  });
  it("clears a person's crew that no longer exists instead of refusing the save", () => {
    const people: OnboardingField = { id: "people", type: "people", label: "People", prefill: "team.people" };
    const crews = { "crews.options": [{ value: "crew-a", label: "Crew A" }] };
    const result = check(people, [{ name: "Sample Person", crewId: "deleted-crew" }, { name: "Other Person", crewId: "crew-a" }], "submit", crews);
    expect(result.valid).toBe(true);
    const rows = (result as { answers: Record<string, unknown> }).answers.people as Array<{ crewId: string }>;
    expect(rows.map(r => r.crewId)).toEqual(["", "crew-a"]);
  });
  it("allows only defined or resolved choices", () => {
    const options = [{ value: "yes", label: "Yes" }];
    for (const type of ["select", "radio", "checkboxes"] as const) {
      const f: OnboardingField = { id: "pick", label: "Pick", type, options };
      expect(check(f, type === "checkboxes" ? ["evil"] : "evil").valid).toBe(false);
      expect(check(f, type === "checkboxes" ? ["yes"] : "yes").valid).toBe(true);
    }
    expect(check({ id: "company", type: "select", label: "Company", optionsFrom: "companies.options" }, "elsewhere", "draft", { "companies.options": options }).valid).toBe(false);
  });
  it("validates matrix rows and columns", () => {
    const f: OnboardingField = { id: "matrix", type: "matrix", label: "Matrix", rows: [{ value: "row", label: "Row" }], options: [{ value: "owner", label: "Owner" }] };
    expect(check(f, { other: ["owner"] }).valid).toBe(false);
    expect(check(f, { row: ["admin"] }).valid).toBe(false);
    expect(check(f, { row: ["owner"] }).valid).toBe(true);
  });
  it("validates addresses and ZIP formats", () => {
    const f: OnboardingField = { id: "a", type: "address", label: "Address", required: true };
    expect(check(f, { street: "A", city: "Town", state: "FL", zip: "12345-6789" }, "submit").valid).toBe(true);
    expect(check(f, { street: "A", city: "Town", state: "F1", zip: "123" }).valid).toBe(false);
    expect(check(f, { street: "A", city: "", state: "", zip: "" }, "draft").valid).toBe(true);
    expect(check(f, { street: "A", city: "", state: "", zip: "" }, "submit").valid).toBe(false);
  });
  it("caps people rows and validates every optional field", () => {
    const f: OnboardingField = { id: "p", type: "people", label: "People", max: 1 };
    for (const rows of [[{ name: "" }], [{ name: "A", email: "bad" }], [{ name: "A", appRole: "root" }], [{ name: "A", language: "xx" }], [{ name: "A", mobile: "x" }], [{ name: "A", hidden: "x" }], [{ name: "A" }, { name: "B" }]]) expect(check(f, rows).valid).toBe(false);
    expect(check(f, [{ name: "Alex", appRole: "none", mobile: "9545550123", language: "both", prefilled: true }]).valid).toBe(true);
  });
  it("enforces showIf and hides dynamic choices with fewer than two options", () => {
    const f: OnboardingField = { id: "other", type: "text", label: "Other", required: true, showIf: { field: "methods", equals: "other" } };
    expect(fieldVisible(f, { methods: ["other"] }, {})).toBe(true);
    expect(fieldVisible(f, { methods: ["phone"] }, {})).toBe(false);
    const result = validateAnswers(ONBOARDING_FORMS.texting, { consentMethods: ["other"] }, "submit");
    expect(result.errors.consentOther).toBeDefined();
    expect(result.errors.companyId).toBeUndefined();
    expect(initialAnswers(ONBOARDING_FORMS.company, { "business.displayName": "Known" }, { displayName: "Changed" }).displayName).toBe("Changed");
  });
});
