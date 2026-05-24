"use client";

import { usePathname } from "next/navigation";

const links = [
  { href: "/admin/businesses", label: "Businesses" },
  { href: "/admin/onboarding", label: "+ Add Company" },
  { href: "/admin/demo", label: "Demo" },
  { href: "/admin/guide", label: "Playbooks" },
];

const bottomLinks = [
  { href: "/company/dashboard", label: "Client view ↗" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav" aria-label="Admin navigation" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ flex: 1 }}>
        {links.map((link) => (
          <a
            href={link.href}
            key={link.href}
            aria-current={pathname === link.href ? "page" : undefined}
          >
            {link.label}
          </a>
        ))}
      </div>
      <div style={{ borderTop: "1px solid #1e293b", paddingTop: 12, marginTop: 16 }}>
        {bottomLinks.map((link) => (
          <a
            href={link.href}
            key={link.href}
            style={{ opacity: 0.6, fontSize: 12 }}
          >
            {link.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
