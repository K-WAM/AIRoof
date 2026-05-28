"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminNav } from "./admin-nav";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
      return;
    }
    if (!loading && user && !user.superadmin && user.role !== "superadmin") {
      router.replace("/company/dashboard");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        Loading…
      </div>
    );
  }

  if (!user || (!user.superadmin && user.role !== "superadmin")) return null;

  async function handleLogout() {
    const { auth } = await import("@/lib/firebase/client");
    const { signOut } = await import("firebase/auth");
    if (auth) await signOut(auth);
    document.cookie = "__session=; path=/; max-age=0; SameSite=Strict";
    router.replace("/login");
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <img src="/logo.png" alt="Luxor AI" className="admin-brand-logo" />
          <p className="admin-brand-sub">Superadmin</p>
        </div>
        <AdminNav />
        <div className="admin-sidebar-footer">
          <span className="admin-sidebar-email">{user.email}</span>
          <button className="admin-signout-btn" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AdminShell>{children}</AdminShell>
    </AuthProvider>
  );
}
