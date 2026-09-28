// Business-level team roles. Distinct from AllowedRole in verifyRole.ts,
// which also includes the platform-level "superadmin" — that's never an
// assignable businessUsers role, only a Firebase custom claim.
//
// "crew" (owner decision 2026-09-28, T-150): field work only — the Field screen, time clock, photos, notes and
// findings for the business's jobs (the same verifyFieldAccess routes a QR link or a Staff technician uses), and
// nothing in the office: every office route lists its roles explicitly, so a crew session is refused there by default.
// Only offered where the industry has the "jobs" module (there is no Field screen otherwise).
export type TeamRole = "owner" | "staff" | "crew" | "viewer";
export const TEAM_ROLES: TeamRole[] = ["owner", "staff", "crew", "viewer"];
// The owner's words (2026-09-28). The Team page picks a user TYPE (src/lib/team/userTypes.ts) — these are what an
// invite email and a crew list call the underlying role.
export const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  owner: "Admin",
  staff: "Office staff",
  crew: "Field",
  viewer: "View only",
};
/** The Team page's ⓘ text. Keep in step with the route gates (verifyRole.ts) — it is a promise about access. */
export const TEAM_ROLE_HELP: Record<TeamRole, string> = {
  owner: "Everything, including the Team page (invites, roles, crews) and Settings.",
  staff: "The office and the field: Pipeline, Calendar, jobs, quotes, invoices, field notes and photos. Can't manage the team.",
  crew: "Field work only: the Field screen, time clock, photos, notes and findings, and their own schedule. No Pipeline, prices or invoices.",
  viewer: "Can look around the office screens. Can't change anything or send field notes.",
};
/** Roles that make sense on a crew (a viewer does no field work). */
export const CREW_MEMBER_ROLES: ReadonlySet<TeamRole> = new Set(["owner", "staff", "crew"]);

// Trade title (Phase 12, Phase 7) — a SEPARATE axis from TeamRole, carrying
// no permissions of its own. Deliberately not folded into TeamRole: role is
// what verifyAuthAndRole's literal ["owner","staff","viewer"] arrays and the
// last-owner guard check everywhere; trade is just a descriptive job title
// that happens to pick a sensible landing page (see src/lib/team/landing.ts)
// and label labor lines/punches. A foreman promoted to run the office is
// still a foreman by trade — the two change independently.
export type TradeTitle =
  | "inspector"
  | "foreman"
  | "technician"
  | "journeyman"
  | "apprentice"
  | "estimator"
  | "installer"
  | "helper"
  | "dispatcher"
  | "office";
export const TRADE_TITLES: TradeTitle[] = [
  "inspector", "foreman", "technician", "journeyman", "apprentice",
  "estimator", "installer", "helper", "dispatcher", "office",
];
export const TRADE_TITLE_LABEL: Record<TradeTitle, string> = {
  inspector: "Inspector",
  foreman: "Foreman",
  technician: "Technician",
  journeyman: "Journeyman",
  apprentice: "Apprentice",
  estimator: "Estimator",
  installer: "Installer",
  helper: "Helper",
  dispatcher: "Dispatcher",
  office: "Office",
};

export interface TeamMember {
  uid: string;
  email: string;
  role: TeamRole;
  trade?: TradeTitle;
  displayName?: string;
  crewId?: string;
  active: boolean;
  createdAt: number;
  status?: "Invited" | "Active" | "Locked";
  lastSignInTime?: string | null;
  lockedAt?: number | null;
  lockedBy?: string | null;
}
