import { describe, expect, it } from "vitest";
import { fieldsForUserType, parseUserType, userTypeOf, userTypesFor } from "../userTypes";

describe("user types", () => {
  it("reads every existing member as one of the five types", () => {
    expect(userTypeOf({ role: "owner" })).toBe("admin");
    expect(userTypeOf({ role: "staff", trade: "technician" })).toBe("office");
    expect(userTypeOf({ role: "crew", trade: "inspector" })).toBe("inspector");
    expect(userTypeOf({ role: "crew", trade: "foreman" })).toBe("technician");
    expect(userTypeOf({ role: "crew" })).toBe("technician");
    expect(userTypeOf({ role: "viewer" })).toBe("viewer");
    // Never undefined — an unexpected role on a member doc used to crash the Team page.
    expect(userTypeOf({ role: "superadmin" })).toBe("viewer");
    expect(userTypeOf({ role: undefined })).toBe("viewer");
  });

  it("writes the role + title each type stands for, keeping a fitting older title", () => {
    expect(fieldsForUserType("inspector")).toEqual({ role: "crew", trade: "inspector" });
    expect(fieldsForUserType("technician", "inspector")).toEqual({ role: "crew", trade: "technician" });
    expect(fieldsForUserType("office")).toEqual({ role: "staff", trade: "office" });
    expect(fieldsForUserType("office", "foreman")).toEqual({ role: "staff", trade: "foreman" });
    expect(fieldsForUserType("office", "inspector")).toEqual({ role: "staff", trade: "office" });
    expect(fieldsForUserType("admin", "estimator")).toEqual({ role: "owner", trade: "estimator" });
  });

  it("hides the field types where there is no field work", () => {
    expect(userTypesFor(false).map((type) => type.id)).toEqual(["admin", "office", "viewer"]);
    expect(userTypesFor(true)).toHaveLength(5);
  });

  it("reads CSV cells in the new words and the old ones", () => {
    expect(parseUserType("Office staff")).toBe("office");
    expect(parseUserType("owner")).toBe("admin");
    expect(parseUserType("crew")).toBe("technician");
    expect(parseUserType("Inspector")).toBe("inspector");
    expect(parseUserType("boss")).toBeNull();
  });
});
