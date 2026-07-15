"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { Menu, X } from "lucide-react";
import { auth } from "@/lib/firebase/client";
import { CompanyNav } from "./company-nav";
import { CommandBar } from "@/components/ui/CommandBar";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useBusinessModules, type CompanyModule } from "@/hooks/useBusinessModules";

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
  const { ready: modulesReady, isEnabled } = useBusinessModules();

  const blockedModule = MODULE_ROUTES.find(
    (r) => pathname?.startsWith(r.prefix) && modulesReady && !isEnabled(r.module)
  );

  useEffect(() => {
    if (blockedModule) router.replace("/company/dashboard");
  }, [blockedModule, router]);

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
    setMobileMenuOpen(false);
  }, [pathname]);

  async function handleLogout() {
    if (auth) await signOut(auth);
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

  const roleLabel = user.superadmin ? "Superadmin" : (user.role ?? "Viewer");

  return (
    <div className="company-shell">
      <header className="company-topbar">
        <div className="company-brand">
          <img src="/logo.png" alt="Luxor AI" className="company-brand-logo" />
        </div>
        <button
          type="button"
          className="mobile-menu-btn"
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((v) => !v)}
        >
          {mobileMenuOpen ? <X size={22} strokeWidth={1.75} /> : <Menu size={22} strokeWidth={1.75} />}
        </button>
        <div className="topbar-right">
          <CompanyNav />
          <CommandBar />
          <div className="topbar-divider" />
          <div className="topbar-user">
            <span className={`user-role-badge ${user.superadmin ? "superadmin" : ""}`}>{roleLabel}</span>
            <span className="user-email">{user.email}</span>
            <button className="logout-btn" onClick={handleLogout}>Sign out</button>
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="mobile-nav-sheet">
          <CompanyNav />
          <div className="mobile-nav-search">
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

      <main className="company-main">{children}</main>
    </div>
  );
}

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>Loading…</div>}>
        <CompanyShell>{children}</CompanyShell>
      </Suspense>
    </AuthProvider>
  );
}
