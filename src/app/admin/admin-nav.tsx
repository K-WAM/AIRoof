"use client";

import { usePathname } from "next/navigation";

const mainLinks = [
  { href: "/admin/businesses", label: "Businesses", icon: "◈" },
  { href: "/admin/onboarding", label: "Add Company", icon: "+" },
  { href: "/admin/usage", label: "Usage", icon: "~" },
];

const toolLinks = [
  { href: "/admin/demo", label: "Demo", icon: "▶" },
  { href: "/admin/invoices", label: "Invoices", icon: "$" },
  { href: "/admin/guide", label: "Playbooks", icon: "≡" },
];

const fieldDemoLink = {
  href: "/company/field?businessId=demo-roofing",
  label: "Field Demo",
  icon: "◉",
};

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav" aria-label="Admin navigation">
      <div className="nav-section">
        <p className="nav-section-label">Platform</p>
        {mainLinks.map((link) => (
          <a
            href={link.href}
            key={link.href}
            className="nav-link"
            aria-current={pathname === link.href ? "page" : undefined}
          >
            <span className="nav-link-icon">{link.icon}</span>
            {link.label}
          </a>
        ))}
      </div>
      <div className="nav-section">
        <p className="nav-section-label">Tools</p>
        {toolLinks.map((link) => (
          <a
            href={link.href}
            key={link.href}
            className="nav-link"
            aria-current={pathname === link.href ? "page" : undefined}
          >
            <span className="nav-link-icon">{link.icon}</span>
            {link.label}
          </a>
        ))}
      </div>
      <div className="nav-spacer" />
      <a href={fieldDemoLink.href} className="nav-link nav-link-cta" style={{ marginBottom: 8 }}>
        <span className="nav-link-icon">{fieldDemoLink.icon}</span>
        {fieldDemoLink.label}
      </a>
      <a href="/company/dashboard?preview=demo-roofing" target="_blank" rel="noopener noreferrer" className="nav-divider-link">
        <span className="nav-link-icon">↗</span>
        Client view
      </a>
    </nav>
  );
}
