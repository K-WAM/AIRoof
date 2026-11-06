"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutDashboard, Phone, Workflow, Briefcase, Mic, CalendarDays, BookOpen, Settings, Compass, MessageSquareText, Users, Wallet, BarChart3, Clock, Lock, type LucideIcon } from "lucide-react";
import { useBusinessModules, type CompanyModule } from "@/hooks/useBusinessModules";
import { useAuth } from "@/contexts/AuthContext";
import { useBootstrap } from "@/contexts/BootstrapContext";
import { navIsActive, upgradeHref, visibleNavLinks, type NavGroup } from "./navModel";

const icons: Record<string, LucideIcon> = {
  "/company/dashboard": LayoutDashboard,
  "/company/calls": Phone,
  "/company/pipeline": Workflow,
  "/company/calendar": CalendarDays,
  "/company/jobs": Briefcase,
  "/company/field": Mic,
  "/company/billing": Wallet,
  "/company/finances": BarChart3,
  "/company/payroll": Clock,
  "/company/customers": Users,
  "/company/library": BookOpen,
  "/company/team": Users,
  "/company/settings": Settings,
  "/company/guide": Compass,
  feedback: MessageSquareText,
};
// A locked tab's path → the module whose upgrade page it opens.
const MODULE_OF: Record<string, CompanyModule> = {
  "/company/calls": "calls", "/company/pipeline": "calls", "/company/jobs": "jobs", "/company/field": "jobs", "/company/billing": "billing",
};
const groups: NavGroup[] = ["Primary", "Manage", "Account", "Help"];

// The Help destination shares the desktop footer and phone menu model.
export function CompanyNav({ helpPlacement = "all" }: { helpPlacement?: "all" | "exclude" | "only" } = {}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");
  const currentModule = searchParams?.get("module");
  const suffix = preview ? `?preview=${encodeURIComponent(preview)}` : "";
  const { isEnabled, isLocked, vocab } = useBusinessModules();
  const { user, loading } = useAuth();
  const showcase = useBootstrap().data?.business.showcase;
  const links = visibleNavLinks({
    role: loading ? undefined : user?.role,
    superadmin: user?.superadmin,
    preview: !!preview,
    isEnabled,
    isLocked,
    vocab,
    showcase,
  }).filter((link) => helpPlacement === "all" || (helpPlacement === "only" ? link.path === "/company/guide" : link.path !== "/company/guide"));

  return (
    <nav className="company-nav" aria-label="Company navigation">
      {groups.map((group) => {
        const items = links.filter((link) => link.group === group);
        if (!items.length) return null;
        return (
          <div key={group} className={`company-nav-group company-nav-${group.toLowerCase()}`}>
            <p className="company-nav-section-label">{group}</p>
            {items.map(({ path, label, locked }) => {
              const Icon = icons[path];
              if (locked) {
                const lockedModule = MODULE_OF[path];
                return (
                  <Link href={`${upgradeHref(lockedModule)}${preview ? `&preview=${encodeURIComponent(preview)}` : ""}`} key={path}
                    className="company-nav-locked" aria-current={pathname === "/company/upgrade" && currentModule === lockedModule ? "page" : undefined}
                    aria-label={`${label} — not in your plan`} title="Not in your plan — tap to see what it adds">
                    <Icon size={16} strokeWidth={1.75} />{label}<Lock size={12} strokeWidth={2} className="company-nav-lock" aria-hidden />
                  </Link>
                );
              }
              return (
                <Link href={`${path}${suffix}`} key={path} aria-current={navIsActive(path, pathname) ? "page" : undefined}>
                  <Icon size={16} strokeWidth={1.75} />{label}
                </Link>
              );
            })}
          </div>
        );
      })}

    </nav>
  );
}
