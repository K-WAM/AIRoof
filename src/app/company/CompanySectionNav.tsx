"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useBootstrap } from "@/contexts/BootstrapContext";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import { moneyNavLinks } from "./navModel";

/** Switch between existing screens: URLs, query deep links and each screen's guards stay intact. */
export function CompanySectionNav({ onOpenFeedback }: { onOpenFeedback: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { isEnabled } = useBusinessModules();
  const showcase = useBootstrap().data?.business.showcase;
  const preview = searchParams?.get("preview");
  const context = { role: user?.role, superadmin: user?.superadmin, preview: !!preview, isEnabled, showcase };
  let label = "";
  let links: Array<{path: string; label: string}> = [];
  if (["/company/pipeline", "/company/calls"].includes(pathname)) {
    label = "Requests sections";
    if (isEnabled("calls")) links = [{path: "/company/pipeline", label: "Requests"}, {path: "/company/calls", label: "Calls"}];
  } else if (["/company/billing", "/company/finances", "/company/payroll"].includes(pathname)) {
    label = "Money sections";
    links = moneyNavLinks(context);
  } else if (["/company/settings", "/company/team"].includes(pathname)) {
    label = "Account sections";
    links = [{path: "/company/settings", label: "Settings"}];
    if (user?.role === "owner" || user?.superadmin) links.push({path: "/company/team", label: "Team"});
  } else if (pathname === "/company/guide") {
    label = "Help sections";
    links = [{path: "/company/guide", label: "Guide"}];
  }
  if (!links.length) return null;
  return <nav aria-label={label} className="company-section-nav no-print" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
    {links.map(link => <Link key={link.path} href={`${link.path}${preview ? `?preview=${encodeURIComponent(preview)}` : ""}`}
      className={`button ${pathname === link.path ? "secondary" : "ghost"}`} aria-current={pathname === link.path ? "page" : undefined} style={{ minHeight: 44 }}>{link.label}</Link>)}
    {pathname === "/company/guide" && user && (!user.superadmin || preview) && <button type="button" className="button ghost" disabled={!!user.viewAs}
      onClick={onOpenFeedback} title={user.viewAs ? "Not available while viewing as someone else" : undefined} style={{ minHeight: 44 }}>
      Send feedback{user.viewAs && <small style={{ display: "block" }}>Not available while viewing as someone else</small>}
    </button>}
  </nav>;
}
