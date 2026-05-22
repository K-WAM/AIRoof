"use client";

import { usePathname } from "next/navigation";

const links = [
  { href: "/admin/onboarding", label: "Onboarding" },
  { href: "/admin/businesses", label: "Businesses" },
  { href: "/admin/calls", label: "Calls" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/demo", label: "Demo" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav" aria-label="Admin navigation">
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
