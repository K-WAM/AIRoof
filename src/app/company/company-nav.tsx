"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const LINKS = [
  { path: "/company/dashboard", label: "Dashboard", icon: "▦" },
  { path: "/company/calls", label: "Calls", icon: "☏" },
  { path: "/company/leads", label: "Leads", icon: "◎" },
  { path: "/company/appointments", label: "Appts", icon: "◷" },
  { path: "/company/jobs", label: "Jobs", icon: "⚒" },
  { path: "/company/calendar", label: "Calendar", icon: "▤" },
  { path: "/company/field", label: "Field", icon: "⊕" },
  { path: "/company/settings", label: "Settings", icon: "⚙" },
];

export function CompanyNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");
  const suffix = preview ? `?preview=${preview}` : "";

  return (
    <nav className="company-nav" aria-label="Company navigation">
      {LINKS.map((link) => (
        <Link
          href={`${link.path}${suffix}`}
          key={link.path}
          aria-current={pathname === link.path ? "page" : undefined}
        >
          <span className="company-nav-icon">{link.icon}</span>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
