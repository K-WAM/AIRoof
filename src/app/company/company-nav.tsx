"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutDashboard, Phone, Workflow, Briefcase, Mic, CalendarDays, BookOpen, Settings, Compass, MessageSquareText, Users, Wallet, type LucideIcon } from "lucide-react";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import { FeedbackForm } from "@/components/ui/FeedbackForm";
import { useAuth } from "@/contexts/AuthContext";
import { visibleNavLinks, type NavGroup } from "./navModel";

const icons: Record<string, LucideIcon> = {
  "/company/dashboard": LayoutDashboard,
  "/company/calls": Phone,
  "/company/pipeline": Workflow,
  "/company/calendar": CalendarDays,
  "/company/jobs": Briefcase,
  "/company/field": Mic,
  "/company/billing": Wallet,
  "/company/customers": Users,
  "/company/library": BookOpen,
  "/company/team": Users,
  "/company/settings": Settings,
  "/company/guide": Compass,
  feedback: MessageSquareText,
};
const groups: NavGroup[] = ["Primary", "Manage", "Account", "Help"];

export function CompanyNav() {
  const pathname = usePathname();
  const preview = useSearchParams()?.get("preview");
  const suffix = preview ? `?preview=${encodeURIComponent(preview)}` : "";
  const { isEnabled, vocab } = useBusinessModules();
  const { user, loading } = useAuth();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const links = visibleNavLinks({
    role: loading ? undefined : user?.role,
    superadmin: user?.superadmin,
    preview: !!preview,
    isEnabled,
    vocab,
  }).filter((link) => link.path !== "feedback" || (!loading && !!user));

  return (
    <nav className="company-nav" aria-label="Company navigation">
      {groups.map((group) => {
        const items = links.filter((link) => link.group === group);
        if (!items.length) return null;
        return (
          <div key={group} className={`company-nav-group company-nav-${group.toLowerCase()}`}>
            <p className="company-nav-section-label">{group}</p>
            {items.map(({ path, label }) => {
              const Icon = icons[path];
              return path === "feedback" ? (
                <button key={path} type="button" className="company-nav-trigger" data-state={feedbackOpen ? "open" : undefined}
                  onClick={() => setFeedbackOpen(true)} aria-haspopup="dialog" aria-label="Send feedback">
                  <Icon size={16} strokeWidth={1.75} />{label}
                </button>
              ) : (
                <Link href={`${path}${suffix}`} key={path} aria-current={pathname === path ? "page" : undefined}>
                  <Icon size={16} strokeWidth={1.75} />{label}
                </Link>
              );
            })}
          </div>
        );
      })}
      {links.some((link) => link.path === "feedback") && <FeedbackForm open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />}
    </nav>
  );
}
