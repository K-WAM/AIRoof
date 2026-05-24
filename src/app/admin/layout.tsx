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
        <div className="admin-brand">Luxor AI</div>
        <AdminNav />
        <div style={{ marginTop: "auto", padding: "12px 0", borderTop: "1px solid #1e293b" }}>
          <p style={{ fontSize: 11, color: "#475569", marginBottom: 8, padding: "0 4px" }}>{user.email}</p>
          <button
            onClick={handleLogout}
            style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 12, padding: "4px", width: "100%", textAlign: "left" }}
          >
            Sign out
          </button>
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
