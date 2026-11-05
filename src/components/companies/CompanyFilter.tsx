// "All | RDSF | RCU" for a multi-company money screen (T-317). Renders nothing for a single-/no-company business, so
// every existing screen stays exactly as it is. Uses the app's existing segmented-control style — no new colours.

import type { BootstrapCompany } from "@/types/company";

type CompanyOption = Pick<BootstrapCompany, "id" | "shortName">;

export function CompanyFilter({
  companies,
  value,
  onChange,
  label = "Filter by company",
}: {
  companies: readonly CompanyOption[] | undefined;
  /** A company id, or "all". */
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  if (!companies || companies.length < 2) return null;
  return (
    <div className="segmented-control segmented-control--row" role="group" aria-label={label}>
      <button className="segment" type="button" aria-pressed={value === "all"} onClick={() => onChange("all")}>All</button>
      {companies.map((company) => (
        <button key={company.id} className="segment" type="button" aria-pressed={value === company.id} onClick={() => onChange(company.id)}>
          {company.shortName}
        </button>
      ))}
    </div>
  );
}
