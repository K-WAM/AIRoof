import { AdminNav } from "./admin-nav";

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">AI Receptionist</div>
        <AdminNav />
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
