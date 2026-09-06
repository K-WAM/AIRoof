"use client";

import { useState } from "react";
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
  MessageSquareText,
  type LucideIcon,
} from "lucide-react";
import { useBusinessModules, type CompanyModule } from "@/hooks/useBusinessModules";
import { FeedbackForm } from "@/components/ui/FeedbackForm";

// Workflow order, not alphabetical: leads/bookings that need attention first
// (Pipeline), then the call log they came from, then scheduling and
// execution, then reference material. Same order for every industry — the
// per-vertical `module` filter is what actually hides what doesn't apply,
// not reordering it.
const LINKS: { path: string; label: string; Icon: LucideIcon; module: CompanyModule | null }[] = [
  { path: "/company/dashboard", label: "Dashboard", Icon: LayoutDashboard, module: null },
  { path: "/company/pipeline",  label: "Pipeline",  Icon: Workflow,        module: null },
  { path: "/company/calls",     label: "Calls",     Icon: Phone,           module: null },
  { path: "/company/calendar",  label: "Calendar",  Icon: CalendarDays,    module: null },
  { path: "/company/jobs",      label: "Jobs",      Icon: Briefcase,       module: "jobs" },
  { path: "/company/field",     label: "Field",     Icon: Mic,             module: "jobs" },
  { path: "/company/library",   label: "Library",   Icon: BookOpen,        module: "library" },
  { path: "/company/guide",     label: "Guide",     Icon: Compass,         module: null },
];

export function CompanyNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");
  const suffix = preview ? `?preview=${preview}` : "";

  const { isEnabled } = useBusinessModules();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const visibleLinks = LINKS.filter((link) => !link.module || isEnabled(link.module));

  return (
    <nav className="company-nav" aria-label="Company navigation">
      <div className="company-nav-primary">
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
      </div>
      {/* Settings and Feedback aren't part of the day-to-day workflow above —
          pinned to the bottom of the nav, set off by a divider. */}
      <div className="company-nav-secondary">
        <Link
          href={`/company/settings${suffix}`}
          aria-current={pathname === "/company/settings" ? "page" : undefined}
        >
          <Settings size={16} strokeWidth={1.75} />
          Settings
        </Link>
        <button
          type="button"
          className="company-nav-trigger"
          onClick={() => setFeedbackOpen(true)}
          title="Send feedback"
          aria-label="Send feedback"
        >
          <MessageSquareText size={16} strokeWidth={1.75} />
          Feedback
        </button>
      </div>
      <FeedbackForm open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </nav>
  );
}
