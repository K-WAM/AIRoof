import { normalizeName } from "@/lib/format/name";
import type { CrewPerson } from "@/types/library";
import type { StaffMember } from "@/types/staff";

// Library -> Crews (T-371c): the staff who are on a crew but have no login. A person who also has a login
// (linked by uid, or the same name on the same crew) is already shown as a login member, so they are left out here.
// The crew lead comes first, then by name.

export function staffOnCrew(crewId: string, staff: StaffMember[], people: CrewPerson[]): StaffMember[] {
  const loginUids = new Set(people.map((person) => person.uid));
  const loginNames = new Set(people.filter((person) => person.crewId === crewId).map((person) => normalizeName(person.name)));
  return staff
    .filter((person) => person.active && person.crewId === crewId)
    .filter((person) => !(person.linkedUid && loginUids.has(person.linkedUid)) && !loginNames.has(normalizeName(person.name)))
    .sort((a, b) => Number(!!b.crewLead) - Number(!!a.crewLead) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
