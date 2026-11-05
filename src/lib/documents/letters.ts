import type { LetterKind, LetterTemplate } from "@/types/documentTemplate";

export const MERGE_FIELDS = [
  ["date", "Date", "November 4, 2026"], ["customer.name", "Customer name", "Example Customer"],
  ["customer.code", "Customer ID", "EX01"], ["attention", "Attention", "Office manager"],
  ["billTo", "Bill to", "12 Example Avenue"], ["serviceAt", "Service at", "24 Sample Street"],
  ["workOrder", "Work order", "J-1234"], ["poNumber", "PO number", "PO-12"],
  ["description", "Description", "Service and maintenance"], ["locations", "Locations", "Main entrance\nSecond floor"],
  ["approvalDate", "Approval date", "November 1, 2026"], ["agreementDate", "Agreement date", "November 1, 2026"],
  ["price", "Price", "$1,250.50"], ["priceWords", "Price in words", "One Thousand Two Hundred Fifty Dollars and 50/100"],
  ["validDays", "Valid days", "10"], ["depositPercent", "Deposit percent", "50"], ["depositAmount", "Deposit amount", "$625.25"],
  ["business.name", "Business name", "Example Services"], ["business.license", "License", "LIC-123"],
  ["signer.name", "Signer name", "Alex Example"], ["signer.title", "Signer title", "Service manager"],
  ["ratesTable", "Labor rates", "Service lead: $75.00 per hour"],
].map(([key, label, example]) => ({ key, label, example }));

export const LETTER_KINDS: LetterKind[] = ["proposal", "tm_authorization", "inspection_completion", "repair_completion", "invoice_opening", "deposit_opening"];
export const EXAMPLE_VALUES = Object.fromEntries(MERGE_FIELDS.map(({ key, example }) => [key, example]));
const fieldKeys = new Set(MERGE_FIELDS.map(({ key }) => key));
export type RenderedLetter = { title: string; blocks: Array<{ heading?: string; paragraphs: string[]; bullets?: string[] }>; missing: string[] };

/** Literal text only. Values are never re-interpreted as templates or HTML. */
export function renderLetter(template: LetterTemplate, values: Record<string, string | undefined>, options: { includeOptional: string[] }): RenderedLetter {
  const missing = new Set<string>();
  const fill = (text: string) => text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key: string) => {
    const value = Object.prototype.hasOwnProperty.call(values, key) && fieldKeys.has(key) ? values[key] : undefined;
    if (!value?.trim()) { missing.add(key); return ""; }
    return value;
  });
  const title = fill(template.title);
  const blocks = template.sections.filter((section) => !section.optional || options.includeOptional.includes(section.id)).map((section) => {
    const heading = section.heading ? fill(section.heading) : undefined;
    const paragraphs: string[] = [], bullets: string[] = [];
    // Split AFTER substitution so multi-line locations and rates remain plain text lines.
    for (const line of fill(section.body).split(/\r?\n/)) {
      if (line.startsWith("- ")) bullets.push(line.slice(2));
      else if (line.trim()) paragraphs.push(line);
    }
    return { ...(heading ? { heading } : {}), paragraphs, ...(bullets.length ? { bullets } : {}) };
  });
  return { title, blocks, missing: [...missing] };
}

const small = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function words(n: number): string {
  if (n < 20) return small[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? `-${small[n % 10]}` : "");
  if (n < 1000) return `${small[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${words(n % 100)}` : ""}`;
  const scale = n >= 1_000_000 ? 1_000_000 : 1000;
  return `${words(Math.floor(n / scale))} ${scale === 1000 ? "Thousand" : "Million"}${n % scale ? ` ${words(n % scale)}` : ""}`;
}
export function amountInWords(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0 || amount > 9_999_999.99) throw new RangeError("Amount must be between 0 and 9,999,999.99");
  const cents = Math.round(amount * 100);
  return `${words(Math.floor(cents / 100))} Dollars${cents % 100 ? ` and ${String(cents % 100).padStart(2, "0")}/100` : ""}`;
}

const make = (kind: LetterKind, title: string, body: string): LetterTemplate => ({ kind, title, sections: [{ id: "opening", body }], updatedAt: 0 });
export const DEFAULT_LETTERS: Record<LetterKind, LetterTemplate> = {
  proposal: { ...make("proposal", "Proposal", "We propose the work described below at {{serviceAt}}."), sections: [
    { id: "opening", body: "We propose the work described below at {{serviceAt}}." },
    { id: "terms", heading: "Terms", body: "This proposal is valid for {{validDays}} days. Additional work requires your approval." },
    { id: "access", heading: "Access", body: "Please arrange access before the scheduled visit.", optional: true, defaultOn: false },
  ] },
  tm_authorization: make("tm_authorization", "Time and materials authorization", "Please authorize {{business.name}} to carry out {{description}} at {{serviceAt}}. Work is billed for actual time and materials. The listed labor rates are for reference."),
  inspection_completion: make("inspection_completion", "Inspection completion notice", "We have completed the inspection at {{serviceAt}}. Please see the recorded findings and photographs for your records."),
  repair_completion: make("repair_completion", "Repair completion notice", "We have completed the approved work at the following locations:\n{{locations}}\nPlease see the photographs for your records."),
  invoice_opening: make("invoice_opening", "Invoice opening", "The work described below at {{serviceAt}} is complete. Please arrange payment under the agreed terms."),
  deposit_opening: make("deposit_opening", "Deposit request", "Under our agreement dated {{agreementDate}}, we request a {{depositPercent}}% deposit of {{depositAmount}}. This amount will be deducted from the final invoice."),
};

export function isLetterKind(value: unknown): value is LetterKind { return typeof value === "string" && LETTER_KINDS.includes(value as LetterKind); }
export function validLetterTemplate(value: unknown): value is LetterTemplate {
  if (!value || typeof value !== "object") return false;
  const v = value as LetterTemplate;
  const text = (s: unknown, max: number) => typeof s === "string" && s.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s);
  return isLetterKind(v.kind) && text(v.title, 120) && !!v.title.trim() && Array.isArray(v.sections) && v.sections.length <= 20 &&
    v.sections.every(s => s && text(s.id, 80) && /^[\w-]+$/.test(s.id) && text(s.body, 4000) &&
      (s.heading === undefined || text(s.heading, 120)) && (s.optional === undefined || typeof s.optional === "boolean") && (s.defaultOn === undefined || typeof s.defaultOn === "boolean")) &&
    new Set(v.sections.map(s => s.id)).size === v.sections.length &&
    (v.signer === undefined || !!v.signer && text(v.signer.name, 120) && text(v.signer.title, 120));
}
