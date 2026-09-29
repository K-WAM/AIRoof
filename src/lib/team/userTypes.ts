// One "Type" per person instead of a Role dropdown plus ten Titles (owner, 2026-09-28: "things can be distilled a
// little" — Admin, Office staff, Inspector, Technician). A type is only a preset over the two stored fields: `role`
// (what they can do — every route gate reads it) and `trade` (the title that picks their landing screen). Nothing
// new is stored, so existing members keep working and the server's checks are unchanged.
import type { TeamRole, TradeTitle } from "@/types/team";

export type UserType = "admin" | "office" | "inspector" | "technician" | "viewer";

export interface UserTypeDef {
  id: UserType;
  label: string;
  /** Plain words for the ⓘ help. A promise about access — keep in step with the route gates. */
  help: string;
  role: TeamRole;
  trade?: TradeTitle;
  /** Needs field work (the "jobs" module): hidden for a dental office. */
  field: boolean;
}

export const USER_TYPES: UserTypeDef[] = [
  { id: "admin", label: "Admin", role: "owner", field: false,
    help: "Everything, including the Team page (adding people and changing their role) and Settings." },
  { id: "office", label: "Office staff", role: "staff", trade: "office", field: false,
    help: "The office: Pipeline, Calendar, jobs, quotes and invoices. Can also use the Field screen. Can't manage the team." },
  { id: "inspector", label: "Inspector", role: "crew", trade: "inspector", field: true,
    help: "Opens on the Field screen with their own schedule: their inspections, blocking time, findings with comments, photos and notes. No prices or invoices." },
  { id: "technician", label: "Technician", role: "crew", trade: "technician", field: true,
    help: "Opens on the Field screen: time clock, job notes, photos and findings. No Pipeline, prices or invoices." },
  { id: "viewer", label: "View only", role: "viewer", field: false,
    help: "Can look around the office screens. Can't change anything." },
];

const BY_ID = new Map(USER_TYPES.map((type) => [type.id, type]));

export function userTypeDef(id: UserType): UserTypeDef {
  return BY_ID.get(id)!;
}

/** The types this business can use: no Inspector/Technician where there is no field work. */
export function userTypesFor(hasField: boolean): UserTypeDef[] {
  return USER_TYPES.filter((type) => hasField || !type.field);
}

/**
 * Which type an existing member is. Role decides first (it is what they can actually do); for a field-only login the
 * title tells Inspector from Technician. Older titles (Foreman, Installer…) fold into the nearest type.
 */
export function userTypeOf(member: { role: TeamRole | string | undefined; trade?: TradeTitle | string | null }): UserType {
  switch (member.role) {
    case "owner": return "admin";
    case "staff": return "office";
    case "crew": return member.trade === "inspector" ? "inspector" : "technician";
    // "viewer" — and anything unexpected on an old or hand-made member doc (e.g. role "superadmin") — reads as the
    // least-privileged type. It must never crash the Team page (2026-09-28: it did, on the harness superadmin's row).
    default: return "viewer";
  }
}

/**
 * The stored fields for a type. A member whose older title already fits keeps it (a Foreman made "Office staff"
 * stays a Foreman by title) — only the role changes, unless the type needs a specific title.
 */
export function fieldsForUserType(id: UserType, currentTrade?: TradeTitle | null): { role: TeamRole; trade: TradeTitle | null } {
  const def = userTypeDef(id);
  if (def.role === "crew") return { role: def.role, trade: def.trade ?? null };
  if (def.role === "staff") return { role: def.role, trade: currentTrade && currentTrade !== "inspector" && currentTrade !== "technician" ? currentTrade : def.trade ?? null };
  return { role: def.role, trade: currentTrade ?? null };
}

/** CSV cell → type. Accepts the type names ("Office staff", "inspector") and the old role names ("owner", "crew"). */
export function parseUserType(value: string | undefined): UserType | null {
  const key = (value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  const aliases: Record<string, UserType> = {
    admin: "admin", owner: "admin",
    office: "office", officestaff: "office", staff: "office",
    inspector: "inspector",
    technician: "technician", tech: "technician", crew: "technician", field: "technician",
    viewer: "viewer", viewonly: "viewer",
  };
  return aliases[key] ?? null;
}
