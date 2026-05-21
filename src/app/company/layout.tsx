"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
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

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        Loading…
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="company-shell">
      <header className="company-topbar">
        <div className="company-brand">Apex Roofing</div>
        <CompanyNav />
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
