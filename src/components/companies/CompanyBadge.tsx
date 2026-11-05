// The one small "which company" label for lists (customers, jobs, calendar, pipeline, money rows). It shows ONLY for a
// non-default company of a multi-company business, so single-company screens and everyday (default) work stay as they
// are. Uses the app's existing neutral `.tag` style — no new colours.

import type { CSSProperties, ReactNode } from "react";
import type { BootstrapCompany } from "@/types/company";

export function companyBadgeLabel(companies: readonly BootstrapCompany[] | undefined, companyId: unknown): string | null {
  if (!companies || companies.length < 2 || typeof companyId !== "string") return null;
  const hit = companies.find((c) => c.id === companyId);
  return hit && !hit.isDefault ? hit.shortName : null;
}

export function CompanyBadge({ companies, companyId }: { companies: readonly BootstrapCompany[] | undefined; companyId: unknown }) {
  const label = companyBadgeLabel(companies, companyId);
  if (!label) return null;
  return <span className="tag" title={`Billed as ${label}`}>{label}</span>;
}

/**
 * The badge plus whatever sits beside it. Single-company and default-company rows get exactly the child element (the
 * pre-badge markup); only a row that actually shows a badge gets the inline-flex wrapper.
 */
export function CompanyBadgeRow({ companies, companyId, children, style }: {
  companies: readonly BootstrapCompany[] | undefined;
  companyId: unknown;
  children: ReactNode;
  style?: CSSProperties;
}) {
  if (!companyBadgeLabel(companies, companyId)) return <>{children}</>;
  return (
    <span style={style ?? { display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <CompanyBadge companies={companies} companyId={companyId} />
      {children}
    </span>
  );
}
