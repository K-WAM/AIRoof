import { describe, expect, it } from "vitest";
import { staffOnCrew } from "../crewMembers";
import type { StaffMember } from "@/types/staff";
import type { CrewPerson } from "@/types/library";

const prov = { origin: "client" as const, source: "x", addedAt: 1 };
const s = (over: Partial<StaffMember>): StaffMember => ({ staffId: over.name ?? "s", name: "N", active: true, provenance: prov, createdAt: 1, updatedAt: 1, ...over });

describe("staffOnCrew", () => {
  it("lists active staff on the crew, lead first, then by name", () => {
    const list = staffOnCrew("c1", [
      s({ name: "Zoe", crewId: "c1" }), s({ name: "Al", crewId: "c1" }), s({ name: "Lee", crewId: "c1", crewLead: true }),
      s({ name: "Gone", crewId: "c1", active: false }), s({ name: "Other", crewId: "c2" }),
    ], []);
    expect(list.map((p) => p.name)).toEqual(["Lee", "Al", "Zoe"]);
  });

  it("leaves out someone already shown as a login member (by link or by name)", () => {
    const people: CrewPerson[] = [{ uid: "u1", name: "José Pérez", role: "crew", crewId: "c1" }];
    const list = staffOnCrew("c1", [
      s({ name: "Other Name", crewId: "c1", linkedUid: "u1" }), s({ name: "jose perez", crewId: "c1" }), s({ name: "Kept", crewId: "c1" }),
    ], people);
    expect(list.map((p) => p.name)).toEqual(["Kept"]);
  });
});
