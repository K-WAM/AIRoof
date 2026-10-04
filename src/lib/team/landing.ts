// Where a teammate lands after signing in (Phase 12, Phase 7). Pure and
// data-driven — no hardcoded per-industry list, matching the templates.ts
// rule this codebase holds everywhere else. Scope-as-convenience, not
// scope-as-security: verifyFieldAccess still grants business-wide read, so
// this only picks a friendlier default screen, never enforces one.
import type { TeamRole, TradeTitle } from "@/types/team";
import type { CompanyModule } from "@/hooks/useBusinessModules";

const FIELD_LANDING_TRADES: ReadonlySet<TradeTitle> = new Set([
  "inspector", "technician", "journeyman", "apprentice", "installer", "helper",
]);

export function defaultLandingPath(
  member: { role?: TeamRole; trade?: TradeTitle },
  disabledModules: CompanyModule[],
): string {
  // The vertical-safety guard always wins: a dental office (no "jobs" module)
  // has no /company/jobs or /company/field to land a trade worker on.
  if (disabledModules.includes("jobs")) return "/company/dashboard";
  // A Crew login (T-150) can only use the Field screen — the layout keeps it there.
  if (member.role === "crew") return "/company/field";
  if (member.trade && FIELD_LANDING_TRADES.has(member.trade)) return "/company/field";
  // A foreman with an office login (Office staff by type, Foreman by title) still starts on the field screen: the voice
  // note is the main thing they do (owner, 2026-10-04).
  if (member.trade === "foreman") return "/company/field";
  return "/company/dashboard";
}
