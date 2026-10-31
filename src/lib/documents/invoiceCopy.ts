export interface InvoiceCopyDefaults {
  opening: string;
  closing: string;
  thankYou: string;
  terms: string;
}

export const DEFAULT_INVOICE_COPY: InvoiceCopyDefaults = {
  opening: "Pursuant to your request and approval, {businessName} dispatched our service team to {address} on {visitDate}. Upon inspection, our technicians identified the following:",
  // No "Please refer to the enclosed photos" (2026-10-30 demo review): it printed on invoices with no photos.
  // The photo pages say so themselves when there are any.
  closing: "All work-related debris was removed from the site. We are requesting payment for services rendered.",
  thankYou: "Thank you for allowing {businessName} to take care of your {industryNoun} needs.",
  terms: "Due upon completion",
};

export function fillInvoiceCopy(template: string, values: { businessName: string; address: string; visitDate: string; industryNoun: string }): string {
  // vocab nouns are title case ("Job"); mid-sentence they read as "your job needs".
  return template.replace(/\{(businessName|address|visitDate|industryNoun)\}/g, (_, key: keyof typeof values) => key === "industryNoun" ? values[key].toLowerCase() : values[key]);
}
