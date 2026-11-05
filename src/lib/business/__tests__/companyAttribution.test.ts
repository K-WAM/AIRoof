import { describe, expect, it } from "vitest";
import { nonDefaultCompanyId } from "../companyAttribution";

const rdsf = { id: "rdsf", name: "Roof Doctors South Florida", shortName: "RDSF", isDefault: true };
const rcu = { id: "rcu", name: "Roofing Concepts Unlimited", shortName: "RCU" };
const two = { billingCompanies: [rdsf, rcu] };

describe("nonDefaultCompanyId", () => {
  it("returns a known non-default company", () => {
    expect(nonDefaultCompanyId(two, "rcu")).toBe("rcu");
  });
  it("returns null for the default company (no new field on everyday work)", () => {
    expect(nonDefaultCompanyId(two, "rdsf")).toBeNull();
    expect(nonDefaultCompanyId(two, undefined)).toBeNull();
  });
  it("returns null for an unknown id rather than guessing", () => {
    expect(nonDefaultCompanyId(two, "gone")).toBeNull();
    expect(nonDefaultCompanyId(two, 42)).toBeNull();
  });
  it("returns null for single-/no-company businesses", () => {
    expect(nonDefaultCompanyId({ billingCompanies: [rcu] }, "rcu")).toBeNull();
    expect(nonDefaultCompanyId({}, "rcu")).toBeNull();
    expect(nonDefaultCompanyId(undefined, "rcu")).toBeNull();
  });
});
