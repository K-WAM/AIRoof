"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  BarChart2,
  Presentation,
  Receipt,
  BookMarked,
  QrCode,
  ExternalLink,
  MessageSquareText,
} from "lucide-react";
import { FeedbackForm } from "@/components/ui/FeedbackForm";

const mainLinks = [
  { href: "/admin/businesses", label: "Businesses", Icon: Building2 },
  { href: "/admin/usage", label: "Usage", Icon: BarChart2 },
];

const toolLinks = [
  { href: "/admin/demo", label: "Demo Studio", Icon: Presentation },
  { href: "/admin/invoices", label: "Invoices", Icon: Receipt },
  { href: "/admin/guide", label: "Playbooks", Icon: BookMarked },
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
      <p className="nav-section-label" style={{ marginBottom: 6 }}>Demo (Apex Roofing)</p>
      <Link href="/company/field?businessId=demo-roofing" className="nav-link nav-link-cta" style={{ marginBottom: 8 }}>
        <QrCode size={15} strokeWidth={1.75} className="nav-link-icon" />
        Demo: Field screen
      </Link>
      <a href="/company/dashboard?preview=demo-roofing" target="_blank" rel="noopener noreferrer" className="nav-divider-link">
        <ExternalLink size={13} strokeWidth={1.75} className="nav-link-icon" />
        Demo: Client view
      </a>
      <FeedbackForm open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </nav>
  );
}
