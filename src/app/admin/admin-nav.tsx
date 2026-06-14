"use client";

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
} from "lucide-react";

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
      </div>
      <div className="nav-spacer" />
      <Link href="/company/field?businessId=demo-roofing" className="nav-link nav-link-cta" style={{ marginBottom: 8 }}>
        <QrCode size={15} strokeWidth={1.75} className="nav-link-icon" />
        Field Demo
      </Link>
      <a href="/company/dashboard?preview=demo-roofing" target="_blank" rel="noopener noreferrer" className="nav-divider-link">
        <ExternalLink size={13} strokeWidth={1.75} className="nav-link-icon" />
        Client view
      </a>
    </nav>
  );
}
