/* eslint-disable @next/next/no-img-element */
import Image from "next/image";
import { logoStyle } from "@/lib/branding/logo";
import type { CompanyBootstrap } from "@/types/bootstrap";

export function CompanyBrand({ business }: { business?: CompanyBootstrap["business"] }) {
  const name = business?.businessName?.trim() || "Luxor AI";
  const logoUrl = business?.logoUrl;
  const companies = business?.companies;
  const multi = !!companies && companies.length >= 2;
  const lightSurfaceLogo = logoStyle({ variant: "color" }, "light");
  if (multi) {
    const primary = companies.find(c => c.isDefault) ?? companies[0];
    return <div className="company-brand company-brand--multi"><div className="company-brand-lockup">
      {primary.logoUrl ? <img src={primary.logoUrl} alt={`${primary.name} logo`} className="company-brand-logo company-brand-logo--business" style={lightSurfaceLogo} /> : <span className="company-brand-name">{primary.shortName}</span>}
      <span className="company-brand-powered"><Image src="/luxor-mark.png" alt="" width={149} height={128} /> Powered by Luxor</span><span className="sr-only">{name}</span>
    </div></div>;
  }
  return <div className="company-brand">
    {logoUrl ? (
      <img src={logoUrl} alt={`${name} logo`} className="company-brand-logo company-brand-logo--business" style={lightSurfaceLogo} />
    ) : <Image src="/luxor-mark.png" alt="Luxor AI" width={149} height={128} priority className="company-brand-logo" />}
    <span className="company-brand-text"><span className="company-brand-name">{name}</span><span className="company-brand-powered"><Image src="/luxor-mark.png" alt="" width={149} height={128} /> Powered by Luxor</span></span>
  </div>;
}

export function OtherCompanyBrand({ business }: { business?: CompanyBootstrap["business"] }) {
  const companies = business?.companies;
  if (!companies || companies.length < 2) return null;
  const primary = companies.find(c => c.isDefault) ?? companies[0];
  const other = companies.find(c => c.id !== primary.id);
  if (!other) return null;
  return <div className="company-brand-other">{other.logoUrl ? <img src={other.logoUrl} alt={`${other.name} logo`} style={logoStyle({ variant: "color" }, "light")} /> : other.shortName}</div>;
}
