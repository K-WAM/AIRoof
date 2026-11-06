import { expect, it } from "vitest";
import { mapSetup, setupId } from "../../../../scripts/lib/jobba-setup.mjs";

it("maps enabled setup rows into existing models without inventing repairs or logins", () => {
  const setup = mapSetup({
    "Crews.csv": [{ Enabled: "Yes", Name: "Example Crew", Types: "Repair", Foreman: "Jordan Example" }, { Enabled: "No", Name: "Retired Crew" }],
    "Labor Types.csv": [{ Enabled: "Yes", Name: "Example Installer", UOM: "Hour(s)", Rate: "$24.00" }, { Enabled: "Yes", Name: "Daily", UOM: "day", Rate: "200" }],
    "Unit Of Measure.csv": [{ Enabled: "Yes", Name: "sq ft" }],
    "Material Categories.csv": [{ Enabled: "Yes", Name: "Example Category", UOM: "sq ft" }],
    "Setup Material Items.csv": [{ Enabled: "Yes", Name: "Example Material", Category: "Example Category", "Std Cost": "12" }],
    "Payment Terms.csv": [{ Enabled: "Yes", Name: "Example term", "Payment due": "30" }],
    "Tax Types.csv": [{ Enabled: "Yes", "Tax Rate": "7.5%" }],
    "Deficiency Types.csv": [{ Enabled: "Yes", Name: "Example deficiency" }],
    "System Types.csv": [{ Enabled: "Yes", Name: "Example system" }],
    "System Types (1).csv": [{ Enabled: "Yes", Name: "Example system" }],
  });
  expect(setup.crews).toHaveLength(1);
  expect(setup.crews[0]).toMatchObject({ name: "Example Crew", types: ["Repair"] });
  expect(setup.laborRates).toEqual([{ role: "Example Installer", rate: 24 }]);
  expect(setup.materials).toEqual([{ name: "Example Material", category: "Example Category", unit: "sq ft", unitPrice: 12 }]);
  expect(setup.terms[0].dueDays).toBe(30);
  expect(setup.defaultTaxRate).toBe(7.5);
  expect(setup.findingCategories).toEqual(["Example deficiency", "Example system"]);
  expect(setup).not.toHaveProperty("items");
});
it("keeps stable crew identities and refuses an ambiguous tax default", () => {
  expect(setupId("crew", "Example Crew")).toBe(setupId("crew", " EXAMPLE CREW "));
  expect(mapSetup({ "Tax Types.csv": [{ Enabled: "Yes", "Tax Rate": "7" }, { Enabled: "Yes", "Tax Rate": "8" }] })).not.toHaveProperty("defaultTaxRate");
});
