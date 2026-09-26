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
  Users,
  type LucideIcon,
} from "lucide-react";
import { useBusinessModules, type CompanyModule } from "@/hooks/useBusinessModules";
import { FeedbackForm } from "@/components/ui/FeedbackForm";
import { useAuth } from "@/contexts/AuthContext";

// Workflow order, not alphabetical: leads/bookings that need attention first
// (Pipeline), then the call log they came from, then scheduling and
// execution, then reference material. Same order for every industry — the
// per-vertical `module` filter is what actually hides what doesn't apply,
// not reordering it. Guide moved into the "Help" group below (T-114) with
// Feedback; it stays reachable, so the Navigation Completeness Rule holds.
const LINKS: { path: string; label: string; Icon: LucideIcon; module: CompanyModule | null }[] = [
  { path: "/company/dashboard", label: "Dashboard", Icon: LayoutDashboard, module: null },
  { path: "/company/pipeline",  label: "Pipeline",  Icon: Workflow,        module: null },
  { path: "/company/calls",     label: "Calls",     Icon: Phone,           module: null },
  { path: "/company/calendar",  label: "Calendar",  Icon: CalendarDays,    module: null },
  { path: "/company/jobs",      label: "Jobs",      Icon: Briefcase,       module: "jobs" },
  { path: "/company/field",     label: "Field",     Icon: Mic,             module: "jobs" },
  // Label is replaced by the industry word (Patients, Clients…) at render time — see visibleLinks below.
  { path: "/company/customers", label: "Customers", Icon: Users,           module: "library" },
  { path: "/company/library",   label: "Library",   Icon: BookOpen,        module: "library" },
];

export function CompanyNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");
  const suffix = preview ? `?preview=${preview}` : "";

  const { isEnabled, vocab } = useBusinessModules();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // Feedback is for client users only (T-114): a superadmin — including one
  // previewing a client via ?preview= — never sees the control or the form,
  // and nothing renders until the profile has resolved so it can't flash.
  const { user, loading } = useAuth();
  const showFeedback = !loading && !user?.superadmin;

  const visibleLinks = LINKS.filter((link) => !link.module || isEnabled(link.module));

  return (
    <nav className="company-nav" aria-label="Company navigation">
      <div className="company-nav-primary">
        {visibleLinks.map(({ path, label: defaultLabel, Icon }) => {
          const label = path === "/company/customers" ? (vocab?.customerNounPlural ?? defaultLabel) : defaultLabel;
          return (
          <Link
            href={`${path}${suffix}`}
            key={path}
            aria-current={pathname === path ? "page" : undefined}
          >
            <Icon size={16} strokeWidth={1.75} />
            {label}
          </Link>
          );
        })}
      </div>
      {/* Settings isn't part of the day-to-day workflow above, and Guide +
          Feedback are the "Help" group — both pinned to the bottom of the
          nav, set off by a divider. */}
      <div className="company-nav-secondary">
        {!loading && (user?.role === "owner" || user?.superadmin) && (
          <Link href={`/company/team${suffix}`} aria-current={pathname === "/company/team" ? "page" : undefined}>
            <Users size={16} strokeWidth={1.75} />
            Team
          </Link>
        )}
        <Link
          href={`/company/settings${suffix}`}
          aria-current={pathname === "/company/settings" ? "page" : undefined}
        >
          <Settings size={16} strokeWidth={1.75} />
          Settings
        </Link>
        <p className="company-nav-section-label" id="company-nav-help-label">Help</p>
        <Link
          href={`/company/guide${suffix}`}
          aria-current={pathname === "/company/guide" ? "page" : undefined}
          aria-describedby="company-nav-help-label"
        >
          <Compass size={16} strokeWidth={1.75} />
          Guide
        </Link>
        {showFeedback && (
          <button
            type="button"
            className="company-nav-trigger"
            data-state={feedbackOpen ? "open" : undefined}
            onClick={() => setFeedbackOpen(true)}
            aria-haspopup="dialog"
            aria-label="Send feedback"
          >
            <MessageSquareText size={16} strokeWidth={1.75} />
            Feedback
          </button>
        )}
      </div>
      {showFeedback && <FeedbackForm open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />}
    </nav>
  );
}
