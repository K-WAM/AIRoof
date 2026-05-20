import { CompanyNav } from "./company-nav";

export default function CompanyLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
