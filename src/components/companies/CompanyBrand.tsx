import Image from "next/image";
import { logoStyle } from "@/lib/branding/logo";
import type { CompanyBootstrap } from "@/types/bootstrap";

export function CompanyBrand({ business }: { business?: CompanyBootstrap["business"] }) {
  const name = business?.businessName?.trim() || "Luxor AI";
  const logoUrl = business?.logoUrl;
  const companies = business?.companies;
  const multi = !!companies && companies.length >= 2;
  const lightSurfaceLogo = logoStyle({ variant: "color" }, "light");
  // Two companies (owner 2026-11-05): both logos side by side, large enough to read, "Powered by Luxor" under them.
  // The logos name the business, so the name text is for screen readers only.
  if (multi) return <div className="company-brand company-brand--multi">
    <div className="company-brand-lockup">
      <div className="company-brand-logos">{[...companies].sort((a, b) => Number(b.isDefault) - Number(a.isDefault)).map(c => c.logoUrl ?
        // Inline logo-library data URIs use the same rendering as the shell's existing business logo.
        // eslint-disable-next-line @next/next/no-img-element
        <img key={c.id} src={c.logoUrl} alt={`${c.name} logo`} className="company-brand-logo company-brand-logo--business" style={lightSurfaceLogo} /> : <span key={c.id} className="company-brand-name">{c.shortName}</span>)}</div>
      <span className="company-brand-powered">Powered by Luxor</span>
      <span className="sr-only">{name}</span>
    </div>
  </div>;
  return <div className="company-brand">
    {logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt={`${name} logo`} className="company-brand-logo company-brand-logo--business" style={lightSurfaceLogo} />
    ) : <Image src="/logo.png" alt="Luxor AI" width={403} height={322} priority className="company-brand-logo" />}
    <span className="company-brand-text"><span className="company-brand-name">{name}</span><span className="company-brand-powered">Powered by Luxor</span></span>
  </div>;
}
