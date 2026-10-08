import type { CompanyModule } from "@/hooks/useBusinessModules";

export type NavGroup = "Primary" | "Manage" | "Account" | "Help";
export interface NavLink {
  path: string;
  label: string;
  group: NavGroup;
  /** Not part of the client's plan: shown greyed with a lock, and opens the upgrade page instead of the screen. */
  locked?: boolean;
}

/** Where a locked tab goes: the upgrade page for the module it belongs to. */
export function upgradeHref(module: CompanyModule): string {
  return `/company/upgrade?module=${module}`;
}

interface NavContext {
  role?: string;
  superadmin?: boolean;
  preview?: boolean;
  isEnabled: (module: CompanyModule) => boolean;
  /** Modules the client could buy. Omitted = nothing shown locked. */
  isLocked?: (module: CompanyModule) => boolean;
  vocab?: { customerNounPlural?: string };
}

/** The route list shared by the desktop sidebar and phone menu. */
export function visibleNavLinks({ role, superadmin, preview, isEnabled, isLocked = () => false, vocab }: NavContext): NavLink[] {
  if (role === "crew" && !superadmin) {
    // A Crew login works only on the Field screen, but keeps Feedback (T-156: every signed-in user can send it).
    const field: NavLink[] = isEnabled("jobs") ? [{ path: "/company/field", label: "Field", group: "Primary" }] : [];
    return [...field, { path: "feedback", label: "Feedback", group: "Help" }];
  }
  const links: NavLink[] = [{ path: "/company/dashboard", label: "Dashboard", group: "Primary" }];
  // What the client bought decides the rest (products → isEnabled): calls, jobs/field, billing. A product they could
  // add still shows, locked, in its usual place (owner, 2026-10-08: "greyed out … upgrade required").
  const show = (module: CompanyModule, items: Array<Omit<NavLink, "group">>) => {
    if (isEnabled(module)) links.push(...items.map((item) => ({ ...item, group: "Primary" as const })));
    else if (isLocked(module)) links.push(...items.map((item) => ({ ...item, group: "Primary" as const, locked: true })));
  };
  show("calls", [{ path: "/company/calls", label: "Calls" }, { path: "/company/pipeline", label: "Pipeline" }]);
  if (isEnabled("calls") || isEnabled("jobs")) links.push({ path: "/company/calendar", label: "Calendar", group: "Primary" });
  show("jobs", [{ path: "/company/jobs", label: "Jobs" }, { path: "/company/field", label: "Field" }]);
  show("billing", [{ path: "/company/billing", label: "Billing" }]);
  if (isEnabled("library")) links.push(
    { path: "/company/customers", label: vocab?.customerNounPlural || "Customers", group: "Manage" },
    { path: "/company/library", label: "Library", group: "Manage" },
  );
  if (role === "owner" || superadmin) links.push({ path: "/company/team", label: "Team", group: "Account" });
  links.push(
    { path: "/company/settings", label: "Settings", group: "Account" },
    { path: "/company/guide", label: "Guide", group: "Help" },
  );
  if (!superadmin || preview) links.push({ path: "feedback", label: "Feedback", group: "Help" });
  return links;
}
