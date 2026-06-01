"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Phone,
  Workflow,
  Briefcase,
  CalendarDays,
  BookOpen,
  Settings,
} from "lucide-react";

const LINKS = [
  { path: "/company/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { path: "/company/calls", label: "Calls", Icon: Phone },
  { path: "/company/pipeline", label: "Pipeline", Icon: Workflow },
  { path: "/company/jobs", label: "Jobs", Icon: Briefcase },
  { path: "/company/calendar", label: "Calendar", Icon: CalendarDays },
  { path: "/company/library", label: "Library", Icon: BookOpen },
  { path: "/company/settings", label: "Settings", Icon: Settings },
];

export function CompanyNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");
  const suffix = preview ? `?preview=${preview}` : "";

  return (
    <nav className="company-nav" aria-label="Company navigation">
      {LINKS.map(({ path, label, Icon }) => (
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
