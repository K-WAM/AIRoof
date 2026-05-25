"use client";

import { usePathname, useSearchParams } from "next/navigation";

const LINKS = [
  { path: "/company/dashboard", label: "Dashboard" },
  { path: "/company/calls", label: "Calls" },
  { path: "/company/leads", label: "Leads" },
  { path: "/company/appointments", label: "Appointments" },
];

export function CompanyNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");
  const suffix = preview ? `?preview=${preview}` : "";

  return (
    <nav className="company-nav" aria-label="Company navigation">
      {LINKS.map((link) => (
        <a
          href={`${link.path}${suffix}`}
          key={link.path}
          aria-current={pathname === link.path ? "page" : undefined}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}
