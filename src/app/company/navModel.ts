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

export interface NavContext {
  role?: string;
  superadmin?: boolean;
  preview?: boolean;
  isEnabled: (module: CompanyModule) => boolean;
  /** Modules the client could buy. Omitted = nothing shown locked. */
  isLocked?: (module: CompanyModule) => boolean;
  vocab?: { customerNounPlural?: string; jobNounPlural?: string };
  /** Per-business preview pages (BusinessConfig.showcase). Missing = off, so the list stays as it was. */
  showcase?: { finances?: boolean; payroll?: boolean };
}

/** The route list shared by the desktop sidebar and phone menu. */
export function visibleNavLinks({ role, superadmin, preview, isEnabled, isLocked = () => false, vocab, showcase }: NavContext): NavLink[] {
  if (role === "crew" && !superadmin) {
    const field: NavLink[] = isEnabled("jobs") ? [{ path: "/company/field", label: "Field", group: "Primary" }] : [];
    return [...field, { path: "/company/guide", label: "Help", group: "Help" }];
  }
  const links: NavLink[] = [{ path: "/company/dashboard", label: "Dashboard", group: "Primary" }];
  // What the client bought decides the rest (products → isEnabled): calls, jobs/field, billing. A product they could
  // add still shows, locked, in its usual place (owner, 2026-10-08: "greyed out … upgrade required").
  const show = (module: CompanyModule, items: Array<Omit<NavLink, "group">>) => {
    if (isEnabled(module)) links.push(...items.map((item) => ({ ...item, group: "Primary" as const })));
    else if (isLocked(module)) links.push(...items.map((item) => ({ ...item, group: "Primary" as const, locked: true })));
  };
  show("calls", [{ path: "/company/pipeline", label: "Requests" }]);
  if (isEnabled("calls") || isEnabled("jobs")) links.push({ path: "/company/calendar", label: "Calendar", group: "Primary" });
  show("jobs", [{ path: "/company/jobs", label: vocab?.jobNounPlural || "Jobs" }]);
  const money = moneyNavLinks({ role, superadmin, preview, isEnabled, showcase });
  if (money.length) links.push({ ...money[0], label: "Finances", group: "Primary" });
  else show("billing", [{ path: "/company/billing", label: "Finances" }]);
  if (isEnabled("library")) links.push(
    { path: "/company/customers", label: vocab?.customerNounPlural || "Customers", group: "Manage" },
    { path: "/company/library", label: "Library", group: "Manage" },
  );
  links.push(
    { path: "/company/settings", label: "Settings", group: "Account" },
    { path: "/company/guide", label: "Help", group: "Help" },
  );
  return links;
}

/**
 * Children use the original product and showcase rules, independently of the combined menu label. The Finances
 * overview comes FIRST when this person can see it: the "Finances" menu item opens links[0], and the overview is the
 * screen that holds imported history (Jobba invoices). Opening Invoices first showed an empty page to a client whose
 * money so far lives only in that history (owner, 2026-11-06: "Finances is currently empty").
 */
export function moneyNavLinks({ role, superadmin, preview, isEnabled, showcase }: NavContext): Array<{path: string; label: string}> {
  const links: Array<{path: string; label: string}> = [];
  const canSeeShowcase = role === "owner" || (superadmin && preview);
  if (canSeeShowcase && showcase?.finances) links.push({path: "/company/finances", label: "Finances"});
  if (isEnabled("billing")) links.push({path: "/company/billing", label: "Invoices"});
  if (canSeeShowcase && showcase?.payroll) links.push({path: "/company/payroll", label: "Payroll"});
  return links;
}

export function navIsActive(path: string, pathname: string | null): boolean {
  if (path === "/company/pipeline") return pathname === path || pathname === "/company/calls";
  if (["/company/billing", "/company/finances", "/company/payroll"].includes(path)) return ["/company/billing", "/company/finances", "/company/payroll"].includes(pathname ?? "");
  if (path === "/company/settings") return pathname === path || pathname === "/company/team";
  return pathname === path;
}
