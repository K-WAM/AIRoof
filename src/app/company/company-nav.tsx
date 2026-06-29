"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { getDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { VERTICAL_TEMPLATES, type VerticalId } from "@/lib/verticals/templates";
import { useBusinessId } from "@/hooks/useBusinessId";

const LINKS = [
  { path: "/company/dashboard", label: "Dashboard", Icon: LayoutDashboard, module: null },
  { path: "/company/calls",     label: "Calls",     Icon: Phone,           module: null },
  { path: "/company/pipeline",  label: "Pipeline",  Icon: Workflow,        module: null },
  { path: "/company/jobs",      label: "Jobs",      Icon: Briefcase,       module: "jobs" },
  { path: "/company/field",     label: "Field",     Icon: Mic,             module: "jobs" },
  { path: "/company/calendar",  label: "Calendar",  Icon: CalendarDays,    module: "calendar" },
  { path: "/company/library",   label: "Library",   Icon: BookOpen,        module: "library" },
  { path: "/company/settings",  label: "Settings",  Icon: Settings,        module: null },
  { path: "/company/guide",     label: "Guide",     Icon: Compass,         module: null },
] as const;

export function CompanyNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");
  const suffix = preview ? `?preview=${preview}` : "";

  const businessId = useBusinessId();
  const [disabledModules, setDisabledModules] = useState<string[]>([]);

  useEffect(() => {
    if (!db || !businessId) return;
    getDoc(doc(db, "businesses", businessId))
      .then((snap) => {
        if (!snap.exists()) return;
        const industry = snap.data().industry as string | undefined;
        const template = industry ? VERTICAL_TEMPLATES[industry as VerticalId] : undefined;
        setDisabledModules(template?.disabledModules ?? []);
      })
      .catch(() => {});
  }, [businessId]);

  const visibleLinks = LINKS.filter(
    (link) => !link.module || !disabledModules.includes(link.module)
  );

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
