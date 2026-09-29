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
}

// One Admin shell (T-166, D6/R8): the same nav for /admin/* and /hub/*. Groups
// are the operator's jobs, not the old Platform/Tools split.
const GROUPS: Array<{ label: string; links: NavLink[] }> = [
  {
    label: "Clients",
    links: [
      { href: "/admin/businesses", label: "Client accounts", Icon: Building2 },
      { href: "/hub/onboarding", label: "+ New client", Icon: Plus },
    ],
  },
  {
    label: "Operations",
    links: [
      { href: "/hub/demo", label: "Demo Studio", Icon: Rocket },
      // Demo entry points kept from the old Hub nav (same destinations).
      { href: "/company/field?businessId=demo-roofing", label: "Demo: Field screen", Icon: QrCode },
    ],
  },
  {
    label: "Billing",
    links: [
      { href: "/admin/usage", label: "Usage", Icon: BarChart2 },
      { href: "/admin/invoices", label: "Invoices", Icon: Receipt },
    ],
  },
  {
    label: "Resources",
    links: [{ href: "/hub/guide", label: "Playbooks", Icon: BookOpen }],
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
          {group.links.map(({ href, label, Icon }) => (
            <Link
              href={href}
              key={href}
              className="nav-link"
              aria-current={pathname === href ? "page" : undefined}
            >
              <Icon size={15} strokeWidth={1.75} className="nav-link-icon" />
              {label}
            </Link>
          ))}
        </div>
      ))}
      <div className="nav-section">
        <p className="nav-section-label">Demo</p>
        {/* Kept from the old Hub nav: the client-view preview opens in a new tab. */}
        <a
          href="/company/dashboard?preview=demo-roofing"
          target="_blank"
          rel="noopener noreferrer"
          className="nav-link"
        >
          <ExternalLink size={15} strokeWidth={1.75} className="nav-link-icon" />
          Demo: Client view
        </a>
      </div>
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
