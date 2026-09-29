"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AdminNav } from "@/app/admin/admin-nav";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

// Same Admin shell and nav as /admin (T-166, D6/R8) — this is a re-skin only,
// not a new auth system. The superadmin gate below is copied exactly from
// src/app/admin/layout.tsx; do not loosen or tighten it. Demo Studio, the
// onboarding wizard and Playbooks keep their /hub/* URLs.
function HubShell({ children }: { children: React.ReactNode }) {
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
    const { getFirebaseAuth } = await import("@/lib/firebase/client");
    const [auth, { signOut }] = await Promise.all([getFirebaseAuth(), import("firebase/auth")]);
    if (auth) await signOut(auth);
    document.cookie = "__session=; path=/; max-age=0; SameSite=Strict";
    router.replace("/login");
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <Image src="/logo.png" alt="Luxor AI" width={403} height={322} priority className="admin-brand-logo" />
          <span className="admin-brand-sub">Superadmin</span>
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

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <HubShell>{children}</HubShell>
    </AuthProvider>
  );
}
