"use client";

// The one superadmin sidebar for /admin/* and /hub/*. On a phone it folds into a "Menu" button (owner, 2026-10-04:
// the whole nav filled the screen before any content), and closes itself after you pick a page.

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { AdminNav } from "./admin-nav";

export function AdminSidebar({ email, onLogout }: { email?: string | null; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => { setOpen(false); }, [pathname]);
  return (
    <aside className="admin-sidebar" data-open={open ? "true" : "false"}>
      <div className="admin-brand">
        <Image src="/logo.png" alt="Luxor AI" width={403} height={322} priority className="admin-brand-logo" />
        <span className="admin-brand-sub">Superadmin</span>
        <button type="button" className="admin-menu-toggle" aria-expanded={open} aria-controls="admin-menu" onClick={() => setOpen((v) => !v)}>
          {open ? <X size={18} strokeWidth={1.75} /> : <Menu size={18} strokeWidth={1.75} />} {open ? "Close" : "Menu"}
        </button>
      </div>
      <div id="admin-menu" className="admin-menu-body">
        <AdminNav />
        <div className="admin-sidebar-footer">
          <span className="admin-sidebar-email">{email}</span>
          <button className="admin-signout-btn" onClick={onLogout}>Sign out</button>
        </div>
      </div>
    </aside>
  );
}
