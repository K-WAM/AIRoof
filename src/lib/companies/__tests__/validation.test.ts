import { describe, expect, it } from "vitest";
import { patchCompanyProfiles, validateCompanies, COMPANY_LIMITS } from "../validation";
const a = { id: "rdsf", name: "Roof Pros South", shortName: "RDSF", isDefault: true };
const b = { id: "rcu", name: "Concepts Unlimited", shortName: "RCU" };
describe("company profile validation", () => {
  it.each([null, [], [a, a], [{ ...a, id: "INVALID" }], [{ ...a, shortName: "123456789" }], [{ ...a, isDefault: false }], [a, { ...b, isDefault: true }], [a,b,{...b,id:"xx"},{...b,id:"yy"},{...b,id:"zz"}], [{ ...a, logoId: "other-tenant" }], [{ ...a, payLink: "javascript:alert(1)" }], [{ ...a, payLink: "http://example.test" }], [{ ...a, payLink: "https://user:pass@example.test" }]])("refuses malformed profiles: %j", raw => {
    expect(validateCompanies(raw, ["logo-a"])).toHaveProperty("error");
  });
  it("trims and strips unknown fields and accepts a tenant logo and HTTPS link", () => {
    expect(validateCompanies([{ ...a, name: "  Roof Pros South  ", logoId: "logo-a", secret: "drop", payLink: " https://pay.example.test " }], ["logo-a"]).companies?.[0]).toEqual({ ...a, logoId: "logo-a", payLink: "https://pay.example.test" });
  });
  it("caps every string", () => { for (const [key, cap] of Object.entries(COMPANY_LIMITS)) expect(validateCompanies([{ ...a, [key]: "x".repeat(cap + 1) }], [])).toHaveProperty("error"); });
  it("owners cannot change structure, default, name, or duplicate identities", () => {
    for (const raw of [[{id:a.id}], [{id:a.id},{id:a.id}], [{id:a.id,isDefault:false},{id:b.id}], [{id:a.id,name:"Rename"},{id:b.id}]]) expect(patchCompanyProfiles([a,b], raw)).toBeNull();
    expect(patchCompanyProfiles([a,b], [{id:b.id,address:"New"},{id:a.id}])).toEqual([a,{...b,address:"New"}]);
  });
});
