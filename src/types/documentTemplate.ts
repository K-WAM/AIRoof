export type LetterKind = "proposal" | "tm_authorization" | "inspection_completion" | "repair_completion" | "invoice_opening" | "deposit_opening";

export interface LetterTemplate {
  kind: LetterKind;
  title: string;
  sections: Array<{ id: string; heading?: string; body: string; optional?: boolean; defaultOn?: boolean }>;
  signer?: { name: string; title: string };
  updatedAt: number;
  updatedBy?: string;
}

/** Saved alongside the report's existing options. Missing layout keeps the original report. */
export interface ReportLetterOptions {
  priceMode?: "lines" | "project";
  layout?: "report" | "inspection_completion" | "repair_completion";
  locations?: string;
  renewalMonth?: string;
  showFindingSections?: boolean;
  noCharge?: boolean;
  approvalDate?: string;
  attention?: string;
  poNumber?: string;
  logoId?: string | null;
}
