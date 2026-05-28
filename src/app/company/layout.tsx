"use client";

export const dynamic = "force-dynamic";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { CompanyNav } from "./company-nav";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

function CompanyShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
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

  async function handleLogout() {
    if (auth) await signOut(auth);
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

  const displayName = user.businessName ?? user.businessId ?? "Dashboard";
  const roleLabel = user.superadmin ? "Superadmin" : (user.role ?? "Viewer");

  return (
    <div className="company-shell">
      <header className="company-topbar">
        <div className="company-brand">
          <img src="/logo.png" alt="Luxor AI" className="company-brand-logo" />
        </div>
        <div className="topbar-right">
          <CompanyNav />
          <div className="topbar-divider" />
          <div className="topbar-user">
            <span className={`user-role-badge ${user.superadmin ? "superadmin" : ""}`}>{roleLabel}</span>
            <span className="user-email">{user.email}</span>
            <button className="logout-btn" onClick={handleLogout}>Sign out</button>
          </div>
        </div>
      </header>
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
