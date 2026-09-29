import type { CompanyModule } from "@/hooks/useBusinessModules";

export type NavGroup = "Primary" | "Manage" | "Account" | "Help";
export interface NavLink {
  path: string;
  label: string;
  group: NavGroup;
}

interface NavContext {
  role?: string;
  superadmin?: boolean;
  preview?: boolean;
  isEnabled: (module: CompanyModule) => boolean;
  vocab?: { customerNounPlural?: string };
}

/** The route list shared by the desktop sidebar and phone menu. */
export function visibleNavLinks({ role, superadmin, preview, isEnabled, vocab }: NavContext): NavLink[] {
  if (role === "crew" && !superadmin) {
    return isEnabled("jobs") ? [{ path: "/company/field", label: "Field", group: "Primary" }] : [];
  }
  const links: NavLink[] = [
    { path: "/company/dashboard", label: "Dashboard", group: "Primary" },
    { path: "/company/calls", label: "Calls", group: "Primary" },
    { path: "/company/pipeline", label: "Pipeline", group: "Primary" },
    { path: "/company/calendar", label: "Calendar", group: "Primary" },
  ];
  if (isEnabled("jobs")) links.push(
    { path: "/company/jobs", label: "Jobs", group: "Primary" },
    { path: "/company/field", label: "Field", group: "Primary" },
  );
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
