"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Briefcase, CalendarDays, Menu, Phone, Users, X } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { CompanyNav } from "./company-nav";
import { FirstLoginGuideNudge } from "./first-login-guide-nudge";
import { CommandBar } from "@/components/ui/CommandBar";
import { QuickAddButton } from "@/components/ui/QuickAddButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { BootstrapProvider } from "@/contexts/BootstrapContext";
import { QuickAddProvider } from "@/contexts/QuickAddContext";
import { useBusinessModules, type CompanyModule } from "@/hooks/useBusinessModules";
import { defaultLandingPath } from "@/lib/team/landing";
import type { TeamRole, TradeTitle } from "@/types/team";

// Routes that only exist for industries using that module. Hiding the nav tab
// isn't enough — a dental tenant typing /company/jobs must not land on it.
// Calendar is deliberately absent: every industry gets one (see CalendarMode).
const MODULE_ROUTES: { prefix: string; module: CompanyModule }[] = [
  { prefix: "/company/jobs", module: "jobs" },
  { prefix: "/company/field", module: "jobs" },
  { prefix: "/company/library", module: "library" },
];

function CompanyShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  // Focus should follow a nav-link navigation, not snap back to the hamburger.
  const skipNavFocusReturn = useRef(false);
  const { ready: modulesReady, isEnabled, family, subscriptionStatus, disabledModules } = useBusinessModules();

  const blockedModule = MODULE_ROUTES.find(
    (r) => pathname?.startsWith(r.prefix) && modulesReady && !isEnabled(r.module)
  );

  // Dashboard-only pause for non-payment (superadmin toggles it from the
  // client's admin config page) — never touches the phone agent. Superadmins
  // always bypass, including in ?preview= mode, so pausing never locks out
  // the person who needs to resume it.
  const paused = modulesReady && subscriptionStatus === "paused" && !user?.superadmin;

  useEffect(() => {
    if (blockedModule) router.replace("/company/dashboard");
  }, [blockedModule, router]);

  // Phase 12/Phase 7 — a trade worker who lands on the generic dashboard (the
  // login page's own fallback, or a bookmark/typed URL) is bounced to their
  // actual day-to-day screen instead. Convenience only, never security:
  // verifyFieldAccess still grants business-wide read regardless of where
  // this sends anyone — see defaultLandingPath's own doc comment.
  useEffect(() => {
    if (!modulesReady || !user || user.superadmin || pathname !== "/company/dashboard") return;
    const target = defaultLandingPath(
      { role: user.role as TeamRole | undefined, trade: user.trade as TradeTitle | undefined },
      disabledModules,
    );
    if (target === "/company/dashboard") return;
    const preview = searchParams?.get("preview");
    router.replace(preview ? `${target}?preview=${preview}` : target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulesReady, user, pathname, disabledModules]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
      return;
    }
    // Superadmin belongs in admin panel — unless using ?preview= or ?businessId= (field/demo links)
    const hasBusinessContext = Boolean(searchParams?.get("preview") || searchParams?.get("businessId"));
    if (!loading && user?.superadmin && !hasBusinessContext) {
      router.replace("/admin/businesses");
    }
  }, [user, loading, router, searchParams]);

  // Close the mobile nav sheet whenever the route changes (link tap, back button, etc.)
  useEffect(() => {
    skipNavFocusReturn.current = true;
    setMobileMenuOpen(false);
  }, [pathname]);

  // Mobile nav sheet behavior (T-114): Escape closes, Tab stays inside while
  // open, and closing returns focus to the hamburger that opened it.
  useFocusTrap(mobileMenuOpen, mobileNavRef, {
    initialFocus: "first",
    returnFocus: !skipNavFocusReturn.current,
    onEscape: () => setMobileMenuOpen(false),
  });

  async function handleLogout() {
    const auth = await getFirebaseAuth();
    if (auth) {
      const { signOut } = await import("firebase/auth");
      await signOut(auth);
    }
    document.cookie = "__session=; path=/; max-age=0; SameSite=Strict";
    router.replace("/login");
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        Loading…
      </div>
    );
  }

  if (!user) return null;
  // Don't paint a module this industry doesn't use while the redirect lands.
  if (blockedModule) return null;
  if (paused) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <Image src="/logo.png" alt="Luxor AI" width={403} height={322} priority style={{ width: 64, height: "auto", margin: "0 auto 20px" }} />
          <h1 style={{ fontSize: 20, margin: "0 0 10px" }}>Account paused</h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 20px", lineHeight: 1.6 }}>
            Your dashboard access is temporarily paused. Your phone line keeps answering calls and booking
            jobs as usual — this only affects this web portal. Contact your account manager to resolve it.
          </p>
          <a href="mailto:connect@luxordev.com" className="button primary" style={{ marginRight: 8 }}>Contact us</a>
          <button className="button" onClick={handleLogout}>Sign out</button>
        </div>
      </div>
    );
  }

  const roleLabel = user.superadmin ? "Superadmin" : (user.role ?? "Viewer");
  const preview = searchParams?.get("preview");
  const previewSuffix = preview ? `?preview=${preview}` : "";
  const crewSuffix = preview ? `?preview=${preview}&section=crews` : "?section=crews";

  return (
    <QuickAddProvider>
    <div className="company-shell" data-portal-family={family ?? undefined}>
      <aside className="company-sidebar">
        <div className="company-brand">
          <Image src="/logo.png" alt="Luxor AI" width={403} height={322} priority className="company-brand-logo" />
        </div>
        <div className="company-sidebar-nav">
          <CompanyNav />
        </div>
        <div className="company-sidebar-footer">
          <QuickAddButton />
          <CommandBar />
          <div className="topbar-user">
            <span className={`user-role-badge ${user.superadmin ? "superadmin" : ""}`}>{roleLabel}</span>
            <span className="user-email">{user.email}</span>
          </div>
          <button className="logout-btn" style={{ width: "100%" }} onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <div className="company-content">
        <header className="company-topbar">
          <div className="company-brand">
            <Image src="/logo.png" alt="Luxor AI" width={403} height={322} priority className="company-brand-logo" />
          </div>
          <nav style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: "auto" }} aria-label="Mobile workflow shortcuts">
            <QuickAddButton variant="icon" />
            {modulesReady && isEnabled("jobs") && (
              <Tooltip content="Jobs">
                <Link className="mobile-menu-btn" href={`/company/jobs${previewSuffix}`} aria-label="Jobs">
                  <Briefcase size={18} strokeWidth={1.75} />
                </Link>
              </Tooltip>
            )}
            <Tooltip content="Calendar">
              <Link className="mobile-menu-btn" href={`/company/calendar${previewSuffix}`} aria-label="Calendar">
                <CalendarDays size={18} strokeWidth={1.75} />
              </Link>
            </Tooltip>
            <Tooltip content="Calls">
              <Link className="mobile-menu-btn" href={`/company/calls${previewSuffix}`} aria-label="Calls">
                <Phone size={18} strokeWidth={1.75} />
              </Link>
            </Tooltip>
            {modulesReady && isEnabled("library") && (
              <Tooltip content="Crew roster">
                <Link className="mobile-menu-btn" href={`/company/library${crewSuffix}`} aria-label="Crew roster">
                  <Users size={18} strokeWidth={1.75} />
                </Link>
              </Tooltip>
            )}
          </nav>
          <Tooltip content={mobileMenuOpen ? "Close menu" : "Open menu"}>
            <button
              type="button"
              className="mobile-menu-btn"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              aria-controls="company-mobile-nav"
              onClick={() => {
                skipNavFocusReturn.current = false;
                setMobileMenuOpen((v) => !v);
              }}
            >
              {mobileMenuOpen ? <X size={22} strokeWidth={1.75} /> : <Menu size={22} strokeWidth={1.75} />}
            </button>
          </Tooltip>
        </header>

        {mobileMenuOpen && (
          <div
            className="mobile-nav-sheet"
            id="company-mobile-nav"
            ref={mobileNavRef}
            tabIndex={-1}
          >
            <CompanyNav />
            <div className="mobile-nav-search">
              <QuickAddButton />
              <CommandBar />
            </div>
            <div className="mobile-nav-divider" />
            <div className="mobile-nav-user">
              <span className={`user-role-badge ${user.superadmin ? "superadmin" : ""}`}>{roleLabel}</span>
              <span className="user-email">{user.email}</span>
            </div>
            <button className="logout-btn mobile-nav-logout" onClick={handleLogout}>Sign out</button>
          </div>
        )}

        <main className="company-main">
          {user.isSandboxVisitor && (
            <div
              role="status"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                flexWrap: "wrap",
                margin: "0 0 16px",
                padding: "10px 16px",
                background: "#fffbeb",
                border: "1px solid #fcd34d",
                borderRadius: 8,
                fontSize: 13,
                color: "#92400e",
                textAlign: "center",
              }}
            >
              <span>
                <strong>You&apos;re exploring a live product demo.</strong> Try{" "}
                <Link href={`/company/field${previewSuffix}`} style={{ color: "#92400e", fontWeight: 700, textDecoration: "underline" }}>
                  Field
                </Link>{" "}
                and log a voice update — it&apos;s real. Booking, sending, and account changes are turned off.
              </span>
              <Link href="/try/roofing" style={{ color: "#92400e", fontWeight: 700, textDecoration: "underline" }}>
                ← Exit demo
              </Link>
            </div>
          )}
          {!user.superadmin && (
            <FirstLoginGuideNudge
              userId={user.uid}
              guideHref={`/company/guide${previewSuffix}`}
            />
          )}
          {children}
        </main>
      </div>
    </div>
    </QuickAddProvider>
  );
}

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>Loading…</div>}>
        <BootstrapProvider>
          <CompanyShell>{children}</CompanyShell>
        </BootstrapProvider>
      </Suspense>
    </AuthProvider>
  );
}
