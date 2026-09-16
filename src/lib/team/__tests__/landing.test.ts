import { describe, it, expect } from "vitest";
import { defaultLandingPath } from "../landing";

describe("defaultLandingPath", () => {
  it("sends field trades to /company/field", () => {
    for (const trade of ["technician", "journeyman", "apprentice", "installer", "helper"] as const) {
      expect(defaultLandingPath({ role: "staff", trade }, [])).toBe("/company/field");
    }
  });

  it("sends a foreman to /company/jobs", () => {
    expect(defaultLandingPath({ role: "staff", trade: "foreman" }, [])).toBe("/company/jobs");
  });

  it("sends everyone else (no trade, or an office-side trade) to the dashboard", () => {
    expect(defaultLandingPath({ role: "owner" }, [])).toBe("/company/dashboard");
    expect(defaultLandingPath({ role: "staff", trade: "estimator" }, [])).toBe("/company/dashboard");
    expect(defaultLandingPath({ role: "staff", trade: "dispatcher" }, [])).toBe("/company/dashboard");
    expect(defaultLandingPath({ role: "staff", trade: "office" }, [])).toBe("/company/dashboard");
    expect(defaultLandingPath({ role: "viewer" }, [])).toBe("/company/dashboard");
  });

  it("always falls back to the dashboard when this industry has no Jobs/Field module — the vertical-safety guard", () => {
    expect(defaultLandingPath({ role: "staff", trade: "technician" }, ["jobs"])).toBe("/company/dashboard");
    expect(defaultLandingPath({ role: "staff", trade: "foreman" }, ["jobs"])).toBe("/company/dashboard");
  });
});
