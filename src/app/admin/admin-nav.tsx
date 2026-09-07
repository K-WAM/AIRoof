"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  Building2,
  BarChart2,
  Receipt,
  MessageSquareText,
} from "lucide-react";
import { FeedbackForm } from "@/components/ui/FeedbackForm";

const mainLinks = [
  { href: "/admin/businesses", label: "Clients", Icon: Building2 },
  { href: "/admin/usage", label: "Usage", Icon: BarChart2 },
];

const toolLinks = [
  { href: "/admin/invoices", label: "Invoices", Icon: Receipt },
];

export function AdminNav() {
  const pathname = usePathname();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <nav className="admin-nav" aria-label="Admin navigation">
      <div className="nav-section">
        <p className="nav-section-label">Platform</p>
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
      </div>
      <div className="nav-section">
        <p className="nav-section-label">Tools</p>
        {toolLinks.map(({ href, label, Icon }) => (
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
      {/* Demo Studio, the onboarding wizard, and Playbooks moved to their own
          Hub (T-055) — this is the one link back, not a duplicated nav. */}
      <Link href="/hub" className="nav-divider-link">
        <ArrowRight size={13} strokeWidth={1.75} className="nav-link-icon" />
        Open Hub (Demo, Onboarding, Playbooks)
      </Link>
      <FeedbackForm open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </nav>
  );
}
