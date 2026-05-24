"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { CompanyNav } from "./company-nav";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

function CompanyShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

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
        <div className="company-brand">{displayName}</div>
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
      <CompanyShell>{children}</CompanyShell>
    </AuthProvider>
  );
}
