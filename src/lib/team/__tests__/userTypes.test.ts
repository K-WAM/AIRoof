import { describe, expect, it } from "vitest";
import { fieldsForUserType, parseUserType, userTypeOf, userTypesFor } from "../userTypes";

describe("user types", () => {
  it("reads every existing member as one of the six types", () => {
    expect(userTypeOf({ role: "owner" })).toBe("admin");
    expect(userTypeOf({ role: "staff", trade: "technician" })).toBe("office");
    expect(userTypeOf({ role: "crew", trade: "inspector" })).toBe("inspector");
    expect(userTypeOf({ role: "crew", trade: "foreman" })).toBe("foreman");
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
    expect(userTypesFor(false).map((type) => type.id)).toEqual(["admin", "manager", "office", "supervisor", "office_admin", "front_desk", "viewer"]);
    expect(userTypesFor(true).map((type) => type.id)).toEqual(["admin", "manager", "office", "supervisor", "office_admin", "front_desk", "inspector", "foreman", "technician", "viewer"]);
  });

  it("reads CSV cells in the new words and the old ones", () => {
    expect(parseUserType("Office staff")).toBe("office");
    expect(parseUserType("owner")).toBe("admin");
    expect(parseUserType("crew")).toBe("technician");
    expect(parseUserType("Inspector")).toBe("inspector");
    expect(parseUserType("Foreman")).toBe("foreman");
    expect(parseUserType("boss")).toBeNull();
  });
});

it("round trips the new presets and labels", async () => {
  const { TRADE_TITLE_LABEL, TRADE_TITLES } = await import("@/types/team");
  for (const [id, label] of [["manager", "Manager"], ["supervisor", "Supervisor"], ["office_admin", "Office admin"], ["front_desk", "Front desk"]] as const) {
    expect(TRADE_TITLES).toContain(id);
    expect(TRADE_TITLE_LABEL[id]).toBe(label);
    expect(userTypeOf(fieldsForUserType(id))).toBe(id);
    expect(parseUserType(id)).toBe(id);
  }
});
