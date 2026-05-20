"use client";

import { usePathname } from "next/navigation";

const links = [
  { href: "/company/dashboard", label: "Dashboard" },
  { href: "/company/calls", label: "Calls" },
  { href: "/company/leads", label: "Leads" },
  { href: "/company/appointments", label: "Appointments" },
  { href: "/company/agent", label: "Agent Settings" },
];

export function CompanyNav() {
  const pathname = usePathname();

  return (
    <nav className="company-nav" aria-label="Company navigation">
      {links.map((link) => (
        <a
          href={link.href}
          key={link.href}
          aria-current={pathname === link.href ? "page" : undefined}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}
