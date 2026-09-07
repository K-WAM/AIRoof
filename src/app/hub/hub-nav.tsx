"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  BookMarked,
  ExternalLink,
  MessageSquareText,
  Presentation,
  QrCode,
  UserPlus,
} from "lucide-react";
import { FeedbackForm } from "@/components/ui/FeedbackForm";

const mainLinks = [
  { href: "/hub/demo", label: "Demo Studio", Icon: Presentation },
  { href: "/hub/onboarding", label: "Onboarding", Icon: UserPlus },
  { href: "/hub/guide", label: "Playbooks", Icon: BookMarked },
];

// The Hub's own nav shell (T-055) — distinct from admin-nav.tsx, which keeps
// only Businesses/Usage/Invoices. Same visual system (reuses .admin-shell/
// .admin-nav CSS), different link set: this is a re-route/re-skin, not a
// redesign.
export function HubNav() {
  const pathname = usePathname();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <nav className="admin-nav" aria-label="Hub navigation">
      <div className="nav-section">
        <p className="nav-section-label">Hub</p>
        {mainLinks.map(({ href, label, Icon }) => (
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
        <button
          type="button"
          className="nav-link"
          onClick={() => setFeedbackOpen(true)}
          aria-label="Send feedback"
        >
          <MessageSquareText size={15} strokeWidth={1.75} className="nav-link-icon" />
          Feedback
        </button>
      </div>
      <div className="nav-spacer" />
      <p className="nav-section-label" style={{ marginBottom: 6 }}>Demo (Apex Roofing)</p>
      <Link href="/company/field?businessId=demo-roofing" className="nav-link nav-link-cta" style={{ marginBottom: 8 }}>
        <QrCode size={15} strokeWidth={1.75} className="nav-link-icon" />
        Demo: Field screen
      </Link>
      <a href="/company/dashboard?preview=demo-roofing" target="_blank" rel="noopener noreferrer" className="nav-divider-link">
        <ExternalLink size={13} strokeWidth={1.75} className="nav-link-icon" />
        Demo: Client view
      </a>
      <Link href="/admin/businesses" className="nav-divider-link" style={{ marginTop: 8 }}>
        <ArrowLeft size={13} strokeWidth={1.75} className="nav-link-icon" />
        Admin console
      </Link>
      <FeedbackForm open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </nav>
  );
}
