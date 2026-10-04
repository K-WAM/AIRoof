"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  BookOpen,
  Building2,
  ExternalLink,
  MessageSquareText,
  Plus,
  QrCode,
  Receipt,
  Rocket,
} from "lucide-react";
import { FeedbackForm } from "@/components/ui/FeedbackForm";
import { useAuth } from "@/contexts/AuthContext";

interface NavLink {
  href: string;
  label: string;
  Icon: typeof Building2;
  /** The client view opens in a new tab so the superadmin console stays where it was. */
  newTab?: boolean;
}

// One Admin shell (T-166, D6/R8): the same nav for /admin/* and /hub/*. Groups
// are the operator's jobs, not the old Platform/Tools split.
// Grouped by the superadmin's jobs (owner, 2026-10-04: every demo thing under ONE "Demo" heading).
const GROUPS: Array<{ label: string; links: NavLink[] }> = [
  {
    label: "Clients",
    links: [
      { href: "/admin/businesses", label: "Client accounts", Icon: Building2 },
      { href: "/hub/onboarding", label: "New client", Icon: Plus },
    ],
  },
  {
    label: "Demo",
    links: [
      { href: "/hub/demo", label: "Demo Studio", Icon: Rocket },
      { href: "/company/dashboard?preview=demo-roofing", label: "Client view", Icon: ExternalLink, newTab: true },
      { href: "/company/field?businessId=demo-roofing", label: "Field screen", Icon: QrCode },
    ],
  },
  {
    label: "Billing",
    links: [
      { href: "/admin/usage", label: "Usage & costs", Icon: BarChart2 },
      { href: "/admin/invoices", label: "Invoices", Icon: Receipt },
    ],
  },
  {
    label: "Help",
    links: [{ href: "/hub/guide", label: "Playbook", Icon: BookOpen }],
  },
];

export function AdminNav() {
  const pathname = usePathname();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // Feedback is for client users (T-114) — a superadmin never needs it, and
  // nothing renders until the profile has resolved so the control can't flash.
  const { user, loading } = useAuth();
  const showFeedback = !loading && !user?.superadmin;

  return (
    <nav className="admin-nav" aria-label="Admin navigation">
      {GROUPS.map((group) => (
        <div className="nav-section" key={group.label}>
          <p className="nav-section-label">{group.label}</p>
          {group.links.map(({ href, label, Icon, newTab }) => (
            <Link
              href={href}
              key={href}
              className="nav-link"
              aria-current={pathname === href ? "page" : undefined}
              {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              <Icon size={15} strokeWidth={1.75} className="nav-link-icon" />
              {label}
            </Link>
          ))}
        </div>
      ))}
      <div className="nav-spacer" />
      {showFeedback && (
        <button
          type="button"
          className="nav-link"
          data-state={feedbackOpen ? "open" : undefined}
          onClick={() => setFeedbackOpen(true)}
          aria-label="Send feedback"
        >
          <MessageSquareText size={15} strokeWidth={1.75} className="nav-link-icon" />
          Feedback
        </button>
      )}
      {showFeedback && <FeedbackForm open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />}
    </nav>
  );
}
