// Business-level team roles. Distinct from AllowedRole in verifyRole.ts,
// which also includes the platform-level "superadmin" — that's never an
// assignable businessUsers role, only a Firebase custom claim.
export type TeamRole = "owner" | "staff" | "viewer";
export const TEAM_ROLES: TeamRole[] = ["owner", "staff", "viewer"];

// Trade title (Phase 12, Phase 7) — a SEPARATE axis from TeamRole, carrying
// no permissions of its own. Deliberately not folded into TeamRole: role is
// what verifyAuthAndRole's literal ["owner","staff","viewer"] arrays and the
// last-owner guard check everywhere; trade is just a descriptive job title
// that happens to pick a sensible landing page (see src/lib/team/landing.ts)
// and label labor lines/punches. A foreman promoted to run the office is
// still a foreman by trade — the two change independently.
export type TradeTitle =
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
  "foreman", "technician", "journeyman", "apprentice",
  "estimator", "installer", "helper", "dispatcher", "office",
];
export const TRADE_TITLE_LABEL: Record<TradeTitle, string> = {
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
