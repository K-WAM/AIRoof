// Where a teammate lands after signing in (Phase 12, Phase 7). Pure and
// data-driven — no hardcoded per-industry list, matching the templates.ts
// rule this codebase holds everywhere else. Scope-as-convenience, not
// scope-as-security: verifyFieldAccess still grants business-wide read, so
// this only picks a friendlier default screen, never enforces one.
import type { TeamRole, TradeTitle } from "@/types/team";
import type { CompanyModule } from "@/hooks/useBusinessModules";

const FIELD_LANDING_TRADES: ReadonlySet<TradeTitle> = new Set([
  "technician", "journeyman", "apprentice", "installer", "helper",
]);

export function defaultLandingPath(
  member: { role?: TeamRole; trade?: TradeTitle },
  disabledModules: CompanyModule[],
): string {
  // The vertical-safety guard always wins: a dental office (no "jobs" module)
  // has no /company/jobs or /company/field to land a trade worker on.
  if (disabledModules.includes("jobs")) return "/company/dashboard";
  if (member.trade && FIELD_LANDING_TRADES.has(member.trade)) return "/company/field";
  if (member.trade === "foreman") return "/company/jobs";
  return "/company/dashboard";
}
