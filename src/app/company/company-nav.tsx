"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Phone,
  Workflow,
  Briefcase,
  Mic,
  CalendarDays,
  BookOpen,
  Settings,
  Compass,
  type LucideIcon,
} from "lucide-react";
import { useBusinessModules, type CompanyModule } from "@/hooks/useBusinessModules";

const LINKS: { path: string; label: string; Icon: LucideIcon; module: CompanyModule | null }[] = [
  { path: "/company/dashboard", label: "Dashboard", Icon: LayoutDashboard, module: null },
  { path: "/company/calls",     label: "Calls",     Icon: Phone,           module: null },
  { path: "/company/pipeline",  label: "Pipeline",  Icon: Workflow,        module: null },
  { path: "/company/jobs",      label: "Jobs",      Icon: Briefcase,       module: "jobs" },
  { path: "/company/field",     label: "Field",     Icon: Mic,             module: "jobs" },
  { path: "/company/calendar",  label: "Calendar",  Icon: CalendarDays,    module: null },
  { path: "/company/library",   label: "Library",   Icon: BookOpen,        module: "library" },
  { path: "/company/settings",  label: "Settings",  Icon: Settings,        module: null },
  { path: "/company/guide",     label: "Guide",     Icon: Compass,         module: null },
];

export function CompanyNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");
  const suffix = preview ? `?preview=${preview}` : "";

  const { isEnabled } = useBusinessModules();

  const visibleLinks = LINKS.filter((link) => !link.module || isEnabled(link.module));

  return (
    <nav className="company-nav" aria-label="Company navigation">
      {visibleLinks.map(({ path, label, Icon }) => (
        <Link
          href={`${path}${suffix}`}
          key={path}
          aria-current={pathname === path ? "page" : undefined}
        >
          <Icon size={16} strokeWidth={1.75} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
