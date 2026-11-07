import { normalizeName } from "@/lib/format/name";
import { USER_TYPES, userTypeDef, userTypeOf } from "@/lib/team/userTypes";
import type { Crew } from "@/types/library";
import type { StaffMember } from "@/types/staff";
import type { TeamMember } from "@/types/team";

// The Team page's "Your team" roster (T-371b): logins (businessUsers) and staff without a login in one list.
// A person with both shows once, as their login row. Pure, so it is unit-tested without a browser.

export type RosterLogin = "Active" | "Invited" | "Disabled" | "Not invited yet";

export interface RosterRow {
  key: string;
  name: string;
  position?: string;
  accessLabel: string;
  crewName?: string;
  crewLead: boolean;
  /** The crew assignment is a Luxor guess: show the Example tag. */
  crewIsSample: boolean;
  login: RosterLogin;
  /** The staff record behind this row, if any (the owner edits it in a sheet). */
  staff?: StaffMember;
  member?: TeamMember;
}

function memberName(member: TeamMember): string {
  return member.displayName?.trim() || member.email.split("@")[0] || member.email;
}

export function loginState(member: TeamMember): Exclude<RosterLogin, "Not invited yet"> {
  return !member.active ? "Disabled" : member.status === "Invited" || !member.lastSignInTime ? "Invited" : "Active";
}

export function buildRoster(members: TeamMember[], staff: StaffMember[], crews: Crew[]): RosterRow[] {
  const crewName = (id: string | undefined) => (id ? crews.find((crew) => crew.crewId === id)?.name : undefined);
  const activeStaff = staff.filter((person) => person.active);
  const used = new Set<string>();
  const byUid = new Map(activeStaff.filter((person) => person.linkedUid).map((person) => [person.linkedUid as string, person]));
  const byName = new Map<string, StaffMember>();
  for (const person of activeStaff) {
    const key = normalizeName(person.name);
    if (key && !byName.has(key)) byName.set(key, person);
  }

  const rows: RosterRow[] = members.map((member) => {
    const linked = byUid.get(member.uid) ?? (member.displayName ? byName.get(normalizeName(member.displayName)) : undefined);
    if (linked) used.add(linked.staffId);
    const ownCrew = crewName(member.crewId);
    const staffCrew = !ownCrew && linked ? crewName(linked.crewId) : undefined;
    return {
      key: `login:${member.uid}`,
      name: memberName(member),
      position: linked?.position,
      accessLabel: userTypeDef(userTypeOf(member)).label,
      crewName: ownCrew ?? staffCrew,
      crewLead: !ownCrew && !!staffCrew && !!linked?.crewLead,
      crewIsSample: !!staffCrew && linked?.crewProvenance?.origin === "luxor-sample",
      login: loginState(member),
      staff: linked,
      member,
    };
  });

  for (const person of activeStaff) {
    if (used.has(person.staffId)) continue;
    const name = crewName(person.crewId);
    rows.push({
      key: `staff:${person.staffId}`,
      name: person.name,
      position: person.position,
      accessLabel: USER_TYPES.find((type) => type.id === person.userType)?.label ?? "Not set",
      crewName: name,
      crewLead: !!name && !!person.crewLead,
      crewIsSample: !!name && person.crewProvenance?.origin === "luxor-sample",
      login: "Not invited yet",
      staff: person,
    });
  }
  return rows;
}
