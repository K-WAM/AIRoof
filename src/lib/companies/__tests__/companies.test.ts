import { describe, expect, it } from "vitest";
import { companiesOf, companyById, defaultCompany, effectiveCompanyId, isMultiCompany, resolveDocumentCompany } from "../companies";

const rdsf = { id: "rdsf", name: "Roof Doctors South Florida", shortName: "RDSF", isDefault: true };
const rcu = { id: "rcu", name: "Roofing Concepts Unlimited", shortName: "RCU" };
const two = { billingCompanies: [rcu, rdsf] };

describe("billing companies", () => {
  it("drops malformed and repeated entries", () => {
    expect(companiesOf({ billingCompanies: [rdsf, { ...rdsf }, { id: "X Y", name: "a", shortName: "a" }, { id: "ok", name: " ", shortName: "b" }, null, rcu] }).map((c) => c.id)).toEqual(["rdsf", "rcu"]);
    expect(companiesOf({ billingCompanies: "rdsf" })).toEqual([]);
    expect(companiesOf(undefined)).toEqual([]);
  });

  it("is multi-company only with two or more valid companies", () => {
    expect(isMultiCompany(two)).toBe(true);
    expect(isMultiCompany({ billingCompanies: [rdsf] })).toBe(false);
    expect(isMultiCompany({})).toBe(false);
  });

  it("uses the marked default, else the first entry", () => {
    expect(defaultCompany(two)?.id).toBe("rdsf");
    expect(defaultCompany({ billingCompanies: [rcu, { ...rdsf, isDefault: undefined }] })?.id).toBe("rcu");
    expect(defaultCompany({})).toBeNull();
  });

  it("falls back to the default for unknown or missing ids", () => {
    expect(effectiveCompanyId(two, "rcu")).toBe("rcu");
    expect(effectiveCompanyId(two, "gone")).toBe("rdsf");
    expect(effectiveCompanyId(two, undefined)).toBe("rdsf");
    expect(companyById(two, 42)?.id).toBe("rdsf");
    expect(effectiveCompanyId({}, "rcu")).toBeNull();
  });

  it("resolves document > job > customer > default, and null for a single company", () => {
    expect(resolveDocumentCompany(two, { documentCompanyId: "rdsf", jobCompanyId: "rcu" })?.id).toBe("rdsf");
    expect(resolveDocumentCompany(two, { jobCompanyId: "rcu", customerCompanyId: "rdsf" })?.id).toBe("rcu");
    expect(resolveDocumentCompany(two, { documentCompanyId: "gone", customerCompanyId: "rcu" })?.id).toBe("rcu");
    expect(resolveDocumentCompany(two, {})?.id).toBe("rdsf");
    expect(resolveDocumentCompany({ billingCompanies: [rcu] }, { jobCompanyId: "rcu" })).toBeNull();
  });

  it("a sent document with no company of its own stays on the default company when the job moves", () => {
    expect(resolveDocumentCompany(two, { documentStatus: "sent", jobCompanyId: "rcu" })?.id).toBe("rdsf");
    expect(resolveDocumentCompany(two, { documentStatus: "paid", customerCompanyId: "rcu" })?.id).toBe("rdsf");
    expect(resolveDocumentCompany(two, { documentStatus: "draft", jobCompanyId: "rcu" })?.id).toBe("rcu");
    expect(resolveDocumentCompany(two, { documentStatus: "sent", documentCompanyId: "rcu", jobCompanyId: "rdsf" })?.id).toBe("rcu");
  });
});
