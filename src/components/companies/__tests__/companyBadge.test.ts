import { describe, expect, it } from "vitest";
import { companyBadgeLabel } from "../CompanyBadge";

const companies = [
  { id: "rdsf", name: "Roof Doctors South Florida", shortName: "RDSF", isDefault: true, logoUrl: null },
  { id: "rcu", name: "Roofing Concepts Unlimited", shortName: "RCU", isDefault: false, logoUrl: null },
];

describe("companyBadgeLabel", () => {
  it("labels only a non-default company of a multi-company business", () => {
    expect(companyBadgeLabel(companies, "rcu")).toBe("RCU");
    expect(companyBadgeLabel(companies, "rdsf")).toBeNull();
    expect(companyBadgeLabel(companies, undefined)).toBeNull();
    expect(companyBadgeLabel(companies, "gone")).toBeNull();
    expect(companyBadgeLabel([companies[1]], "rcu")).toBeNull();
    expect(companyBadgeLabel(undefined, "rcu")).toBeNull();
  });
});
