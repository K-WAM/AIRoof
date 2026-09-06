// Business-level team roles. Distinct from AllowedRole in verifyRole.ts,
// which also includes the platform-level "superadmin" — that's never an
// assignable businessUsers role, only a Firebase custom claim.
export type TeamRole = "owner" | "staff" | "viewer";
export const TEAM_ROLES: TeamRole[] = ["owner", "staff", "viewer"];

export interface TeamMember {
  uid: string;
  email: string;
  role: TeamRole;
  active: boolean;
  createdAt: number;
}
