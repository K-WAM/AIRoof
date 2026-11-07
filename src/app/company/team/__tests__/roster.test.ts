import { describe, expect, it } from "vitest";
import { buildRoster } from "../roster";
import type { Crew } from "@/types/library";
import type { StaffMember } from "@/types/staff";
import type { TeamMember } from "@/types/team";

const crews: Crew[] = [{ crewId: "c1", name: "Tyler Crew", color: "#111", active: true, createdAt: 1 }];
const prov = { origin: "client" as const, source: "x", addedAt: 1 };
const person = (over: Partial<StaffMember>): StaffMember => ({ staffId: "s", name: "N", active: true, provenance: prov, createdAt: 1, updatedAt: 1, ...over });
const login = (over: Partial<TeamMember>): TeamMember => ({ uid: "u", email: "a@b.test", role: "staff", active: true, createdAt: 1, lastSignInTime: "2026-11-01", ...over });

describe("buildRoster", () => {
  it("shows a person with a login once, by linkedUid", () => {
    const rows = buildRoster([login({ uid: "u1", displayName: "Someone" })], [person({ staffId: "s1", name: "Different Name", linkedUid: "u1", position: "Estimator" })], crews);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Someone", position: "Estimator", login: "Active" });
  });

  it("merges by name when there is no link, ignoring case and accents", () => {
    const rows = buildRoster([login({ uid: "u1", displayName: "JOSE Perez" })], [person({ staffId: "s1", name: "José Pérez" })], crews);
    expect(rows).toHaveLength(1);
    expect(rows[0].staff?.staffId).toBe("s1");
  });

  it("lists staff without a login as Not invited yet, with the crew, lead and Example flag", () => {
    const rows = buildRoster([], [person({ staffId: "s1", name: "Tyler", crewId: "c1", crewLead: true, crewProvenance: { origin: "luxor-sample", source: "x", addedAt: 1 }, userType: "foreman" })], crews);
    expect(rows[0]).toMatchObject({ login: "Not invited yet", crewName: "Tyler Crew", crewLead: true, crewIsSample: true, accessLabel: "Foreman" });
  });

  it("does not tag a crew an owner confirmed, skips inactive staff and survives an unknown user type", () => {
    const rows = buildRoster([], [
      person({ staffId: "s1", name: "A", crewId: "c1", crewProvenance: prov }),
      person({ staffId: "s2", name: "B", active: false }),
      person({ staffId: "s3", name: "C", userType: "bogus" as never }),
    ], crews);
    expect(rows.map((row) => row.name)).toEqual(["A", "C"]);
    expect(rows[0].crewIsSample).toBe(false);
    expect(rows[1].accessLabel).toBe("Not set");
  });

  it("reports Invited and Disabled logins", () => {
    const rows = buildRoster([login({ uid: "a", lastSignInTime: null }), login({ uid: "b", active: false })], [], crews);
    expect(rows.map((row) => row.login)).toEqual(["Invited", "Disabled"]);
  });
});
