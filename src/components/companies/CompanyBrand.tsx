import Image from "next/image";
import { logoStyle } from "@/lib/branding/logo";
import type { CompanyBootstrap } from "@/types/bootstrap";

export function CompanyBrand({ business }: { business?: CompanyBootstrap["business"] }) {
  const name = business?.businessName?.trim() || "Luxor AI";
  const logoUrl = business?.logoUrl;
  const companies = business?.companies;
  const multi = !!companies && companies.length >= 2;
  const lightSurfaceLogo = logoStyle({ variant: "color" }, "light");
  return <div className={multi ? "company-brand company-brand--multi" : "company-brand"}>
    {multi ? <div className="company-brand-logos">{[...companies].sort((a, b) => Number(b.isDefault) - Number(a.isDefault)).map(c => c.logoUrl ?
      // Inline logo-library data URIs use the same rendering as the shell's existing business logo.
      // eslint-disable-next-line @next/next/no-img-element
      <img key={c.id} src={c.logoUrl} alt={`${c.name} logo`} className="company-brand-logo company-brand-logo--business" style={lightSurfaceLogo} /> : <span key={c.id}>{c.shortName}</span>)}</div> : logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt={`${name} logo`} className="company-brand-logo company-brand-logo--business" style={lightSurfaceLogo} />
    ) : <Image src="/logo.png" alt="Luxor AI" width={403} height={322} priority className="company-brand-logo" />}
    <span className="company-brand-text"><span className="company-brand-name">{name}</span><span className="company-brand-powered">Powered by Luxor</span></span>
  </div>;
}
